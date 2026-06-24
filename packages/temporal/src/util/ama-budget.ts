import { variantEncodeUnits } from './ffmpeg';
import { logger } from './logger';

const moduleLogger = logger.child({ module: 'util/ama-budget' });

// Whether this worker process is running against an AMD MA35D (AMA) device.
// Mirrors the `TRANSCODE_HW_ACCEL=ama:<n>` convention used by the transcode
// activity. CPU (libx264) workers leave this false and keep their existing
// fixed-concurrency behavior — none of the budget machinery engages.
export const amaBudgetEnabled =
  process.env.TRANSCODE_HW_ACCEL?.startsWith('ama:') ?? false;

// The cheapest video ladder rung (a 480p-only job). Used as the threshold below
// which the slot supplier stops polling: once a device has less than this much
// budget free, there's no point pulling even the smallest video job.
export const MIN_SLOT_BUDGET = variantEncodeUnits('VIDEO_480P');

// Total encode budget for a single device, in 1080p60-equivalent units (see
// `variantsToEncodeCost`). We emit H.264 ("single density"), whose per-device
// encoder ceiling is ~8x1080p60; the default of 6 stays safely under that
// (~one 4K-source ladder's worth) because the MA35D *errors out* rather than
// degrading when oversubscribed (see packages/transcode-worker/README.md).
// Floored at MIN_SLOT_BUDGET so a 0 / NaN misconfig can't wedge a pod into
// never polling (free() < MIN_SLOT_BUDGET would stop the slot supplier forever).
export const AMA_ENCODE_BUDGET = Math.max(
  MIN_SLOT_BUDGET,
  Number(process.env.AMA_ENCODE_BUDGET) || 6,
);

// Hard cap on how many transcode activities this worker will pull off the queue
// at once, regardless of budget. This bounds how many jobs can sit waiting for
// budget on a single pod (each holds a Temporal activity slot while it waits),
// so a busy pod leaves surplus work on the queue for idle pods to pick up.
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

/**
 * A weighted async semaphore representing one AMA device's encoder budget.
 * `acquire(cost)` resolves once `cost` units fit, returning an idempotent
 * release function. A job whose cost exceeds the whole budget (e.g. a 4K ladder
 * against a small budget) is admitted alone once the device is otherwise idle,
 * so it can never deadlock.
 *
 * Admission is NOT FIFO: `notify()` wakes all waiters and the first to win the
 * synchronous check-and-commit takes the budget, so a stream of cheap jobs can
 * in principle keep deferring a parked expensive one. In practice this is
 * bounded — the slot supplier's `AMA_MAX_CONCURRENT` cap limits how many waiters
 * can pile up, and the activity's `startToCloseTimeout` is the ultimate backstop
 * — so we accept it rather than track insertion order.
 */
export class AmaEncodeBudget {
  private inUse = 0;

  constructor(readonly total: number) {}

  free(): number {
    return Math.max(0, this.total - this.inUse);
  }

  used(): number {
    return this.inUse;
  }

  private canAcquire(cost: number): boolean {
    // Oversized job: run it alone rather than wedge forever.
    if (this.inUse === 0) {
      return true;
    }
    return this.inUse + cost <= this.total;
  }

  async acquire(cost: number, signal?: AbortSignal): Promise<() => void> {
    if (cost <= 0) {
      return () => {};
    }
    while (!this.canAcquire(cost)) {
      await budgetChanges.wait(signal);
    }
    this.inUse += cost;
    moduleLogger.debug(
      `Acquired ${cost.toFixed(2)} AMA encode units (in use: ${this.inUse.toFixed(
        2,
      )}/${this.total})`,
    );
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.inUse -= cost;
      moduleLogger.debug(
        `Released ${cost.toFixed(2)} AMA encode units (in use: ${this.inUse.toFixed(
          2,
        )}/${this.total})`,
      );
      budgetChanges.notify();
    };
  }
}

export const amaEncodeBudget = new AmaEncodeBudget(AMA_ENCODE_BUDGET);
