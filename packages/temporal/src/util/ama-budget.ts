import { variantEncodeUnits } from './ffmpeg';
import { logger } from './logger';

const moduleLogger = logger.child({ module: 'util/ama-budget' });

// Whether this worker process is running against an AMD MA35D (AMA) device.
// Mirrors the `TRANSCODE_HW_ACCEL=ama:<n>` convention used by the transcode
// activity. CPU (libx264) workers leave this false and keep their existing
// fixed-concurrency behavior — none of the budget machinery engages.
export const amaBudgetEnabled =
  process.env.TRANSCODE_HW_ACCEL?.startsWith('ama:') ?? false;

// --- Device capacity model -------------------------------------------------
//
// The MA35D's encoder is bound by TWO resources, and XRM hard-fails
// ("Insufficient resources available for allocation") when EITHER is exceeded:
//
//  1. SESSIONS — the count of concurrent on-device h264_ama encoder contexts.
//     Each HLS rendition is one session, so a single ladder already opens 3-4.
//     This is the constraint a pixel-only budget missed (2026-06-24 incident):
//     one big ladder fit, but two small jobs (6-8 sessions, low pixels)
//     exhausted the encoder and ~50% of transcodes hard-failed. PRIMARY binding
//     constraint.
//  2. PIXELS — aggregate encode throughput in 1080p60-equivalent units (the
//     ~4Kp60-per-engine load limit). Binds for 4K-heavy concurrency.
//
// A job is admitted only when BOTH fit. See `AmaDeviceBudget`.

// Smallest job the slot supplier keeps polling for: one 480p rendition = 1
// session and a 480p-ladder's pixels. Below this in either dimension the device
// is full and the supplier parks (leaving work for idle pods). Also floors the
// pixel budget so a 0 / NaN misconfig can't wedge a pod into never polling.
export const MIN_SLOT_SESSIONS = 1;
export const MIN_SLOT_PIXELS = variantEncodeUnits('VIDEO_480P');

// Per-device encoder SESSION budget. Default 4 == one 4K-source ladder
// (4K+1080p+720p+480p). Conservative: measure the device's true session limit
// on-hardware before raising. Concurrency is ALSO hard-capped by
// AMA_MAX_CONCURRENT, which the manifest pins to 1 until that validation.
export const AMA_MAX_SESSIONS = Math.max(
  1,
  Number(process.env.AMA_MAX_SESSIONS) || 4,
);

// Per-device PIXEL budget, in 1080p60-equivalent units. We emit H.264 ("single
// density", ~8x1080p60/device); 6 stays under that. (Env name kept as
// AMA_ENCODE_BUDGET for manifest compatibility.)
export const AMA_PIXEL_BUDGET = Math.max(
  MIN_SLOT_PIXELS,
  Number(process.env.AMA_ENCODE_BUDGET) || 6,
);

// Hard cap on how many activities this worker pulls off the queue at once,
// regardless of budget. Bounds how many jobs can sit waiting for budget on one
// pod (each holds a Temporal activity slot while it waits), so a busy pod leaves
// surplus work on the queue for idle pods. This is the operator's master
// concurrency switch (pinned to 1 in the manifest pending session validation).
export const AMA_MAX_CONCURRENT = Math.max(
  1,
  Number(process.env.AMA_MAX_CONCURRENT) || 8,
);

function makeAbortError(): Error {
  const error = new Error('AMA budget wait aborted');
  // Temporal's custom slot supplier contract requires aborted reservations to
  // reject with an error named 'AbortError'; any other thrown error is logged
  // and ignored. See CustomSlotSupplier.reserveSlot in @temporalio/worker.
  error.name = 'AbortError';
  return error;
}

/**
 * A minimal edge-triggered condition variable. `notify()` wakes every waiter
 * currently parked; each then re-checks its own predicate and re-parks if it
 * still can't proceed. Single-threaded JS guarantees a woken waiter runs its
 * synchronous check-and-commit before any other waiter resumes, so no extra
 * locking is needed.
 *
 * Exported for unit testing.
 */
export class Notifier {
  private readonly waiters = new Set<() => void>();

  notify(): void {
    const woken = [...this.waiters];
    this.waiters.clear();
    for (const resume of woken) {
      resume();
    }
  }

  wait(signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(makeAbortError());
        return;
      }
      const cleanup = () => {
        this.waiters.delete(resume);
        signal?.removeEventListener('abort', onAbort);
      };
      const resume = () => {
        cleanup();
        resolve();
      };
      const onAbort = () => {
        cleanup();
        reject(makeAbortError());
      };
      this.waiters.add(resume);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

// Shared change signal woken whenever encode budget is released OR a slot
// supplier permit is released. Both `acquire()` waiters (in the activity) and
// `reserveSlot()` waiters (in the slot supplier) park on it.
export const budgetChanges = new Notifier();

/** The two device resources a job consumes. See the capacity-model comment. */
export type AmaCost = {
  /** On-device h264_ama encoder sessions (1 per video rendition; 0 for audio). */
  sessions: number;
  /** Encode throughput in 1080p60-equivalent units. */
  pixels: number;
};

/**
 * A dual-constraint async semaphore for one AMA device: a job is admitted only
 * when it fits in BOTH the session and pixel budgets. `acquire(cost)` resolves
 * once it fits, returning an idempotent release. A job that exceeds a whole
 * budget dimension is admitted alone once the device is otherwise idle, so it
 * can never deadlock.
 *
 * Admission is NOT FIFO: `notify()` wakes all waiters and the first to win the
 * synchronous check-and-commit takes the budget, so a stream of cheap jobs can
 * in principle keep deferring a parked expensive one. In practice this is
 * bounded — the slot supplier's `AMA_MAX_CONCURRENT` cap limits how many waiters
 * can pile up, and the activity's `startToCloseTimeout` is the ultimate backstop
 * — so we accept it rather than track insertion order.
 */
export class AmaDeviceBudget {
  private used: AmaCost = { sessions: 0, pixels: 0 };

  constructor(readonly max: AmaCost) {}

  freeSessions(): number {
    return Math.max(0, this.max.sessions - this.used.sessions);
  }

  freePixels(): number {
    return Math.max(0, this.max.pixels - this.used.pixels);
  }

  usedSessions(): number {
    return this.used.sessions;
  }

  usedPixels(): number {
    return this.used.pixels;
  }

  private idle(): boolean {
    return this.used.sessions === 0 && this.used.pixels === 0;
  }

  private fits(cost: AmaCost): boolean {
    // Oversized job (exceeds a whole budget dimension): run it alone once the
    // device is otherwise idle, rather than wedge forever.
    if (this.idle()) {
      return true;
    }
    return (
      this.used.sessions + cost.sessions <= this.max.sessions &&
      this.used.pixels + cost.pixels <= this.max.pixels
    );
  }

  async acquire(cost: AmaCost, signal?: AbortSignal): Promise<() => void> {
    if (cost.sessions <= 0 && cost.pixels <= 0) {
      return () => {};
    }
    while (!this.fits(cost)) {
      await budgetChanges.wait(signal);
    }
    this.used.sessions += cost.sessions;
    this.used.pixels += cost.pixels;
    moduleLogger.debug(
      `Acquired AMA budget (sessions ${this.used.sessions}/${this.max.sessions}, pixels ${this.used.pixels.toFixed(2)}/${this.max.pixels})`,
    );
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.used.sessions -= cost.sessions;
      this.used.pixels -= cost.pixels;
      budgetChanges.notify();
    };
  }
}

export const amaDeviceBudget = new AmaDeviceBudget({
  sessions: AMA_MAX_SESSIONS,
  pixels: AMA_PIXEL_BUDGET,
});
