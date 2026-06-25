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
// A job is admitted only when BOTH fit. See `AmaDeviceBudget`. The cap on how
// many jobs a pod pulls is the SDK's plain fixed-size activity slots
// (`maxConcurrentActivityTaskExecutions` = AMA_MAX_CONCURRENT in the worker);
// the budget here is purely the activity-side device-safety gate.

// One 480p rendition's pixels — used only to floor the pixel budget so a
// 0 / NaN misconfig can't drive it to zero.
const MIN_PIXEL_BUDGET = variantEncodeUnits('VIDEO_480P');

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
  MIN_PIXEL_BUDGET,
  Number(process.env.AMA_ENCODE_BUDGET) || 6,
);

// Max concurrent transcode activities a pod pulls — wired straight into the
// SDK's `maxConcurrentActivityTaskExecutions` (fixed-size slots). The operator's
// master concurrency switch (pinned to 1 in the manifest pending session
// validation). Each pulled job still blocks on the budget below before ffmpeg,
// so this is an upper bound on pulled tasks, not on device load.
export const AMA_MAX_CONCURRENT = Math.max(
  1,
  Number(process.env.AMA_MAX_CONCURRENT) || 8,
);

function makeAbortError(): Error {
  const error = new Error('AMA budget wait aborted');
  // Aborted budget waits reject with an error named 'AbortError' so a cancelled
  // activity propagates cancellation cleanly (matches Temporal's convention).
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
    // Scheduling visibility: log when a job has to wait for the device (and how
    // many times it re-checked), so a starved/wedged pod is diagnosable from
    // logs. Throughput on the AMA pods is sensitive to this admission step.
    let waits = 0;
    while (!this.fits(cost)) {
      if (waits === 0) {
        moduleLogger.info(
          `AMA budget full, queueing job (need sessions ${cost.sessions}, pixels ${cost.pixels.toFixed(2)}; in use ${this.used.sessions}/${this.max.sessions} sessions, ${this.used.pixels.toFixed(2)}/${this.max.pixels} pixels)`,
        );
      }
      waits += 1;
      await budgetChanges.wait(signal);
    }
    this.used.sessions += cost.sessions;
    this.used.pixels += cost.pixels;
    moduleLogger.info(
      `AMA budget acquired (sessions ${this.used.sessions}/${this.max.sessions}, pixels ${this.used.pixels.toFixed(2)}/${this.max.pixels}${waits > 0 ? `; after ${waits} wait(s)` : ''})`,
    );
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.used.sessions -= cost.sessions;
      this.used.pixels -= cost.pixels;
      moduleLogger.info(
        `AMA budget released (sessions ${this.used.sessions}/${this.max.sessions}, pixels ${this.used.pixels.toFixed(2)}/${this.max.pixels})`,
      );
      budgetChanges.notify();
    };
  }
}

export const amaDeviceBudget = new AmaDeviceBudget({
  sessions: AMA_MAX_SESSIONS,
  pixels: AMA_PIXEL_BUDGET,
});
