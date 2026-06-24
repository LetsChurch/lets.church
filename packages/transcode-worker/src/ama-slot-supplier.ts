import {
  AMA_MAX_CONCURRENT,
  type AmaDeviceBudget,
  amaDeviceBudget,
  budgetChanges,
  MIN_SLOT_PIXELS,
  MIN_SLOT_SESSIONS,
} from '@letschurch/temporal/util/ama-budget';
import type {
  ActivitySlotInfo,
  CustomSlotSupplier,
  SlotPermit,
} from '@temporalio/worker';

export type AmaSlotSupplierOptions = {
  /** Device budget to gate against. Defaults to the per-process singleton. */
  budget?: AmaDeviceBudget;
  /** Max concurrently pulled tasks. Defaults to `AMA_MAX_CONCURRENT`. */
  maxConcurrent?: number;
  /** Free-session threshold below which polling stops. Defaults to `MIN_SLOT_SESSIONS`. */
  minSessions?: number;
  /** Free-pixel threshold below which polling stops. Defaults to `MIN_SLOT_PIXELS`. */
  minPixels?: number;
};

/**
 * A Temporal custom slot supplier that gates how many transcode activities this
 * AMA worker pulls off the queue.
 *
 * The supplier is deliberately a coarse gate: it can't see a task's resolution
 * at reservation time (the probe only reaches the activity body), so it does
 * NOT do the precise per-job weighting — that lives in the activity, which
 * claims `amaDeviceBudget` before running ffmpeg. Here we only:
 *
 *   1. cap concurrent pulled tasks at `AMA_MAX_CONCURRENT`, bounding how many
 *      jobs can sit waiting for budget on one pod, and
 *   2. stop polling entirely once the device has room for neither another
 *      encoder session nor the cheapest video job's pixels, so a saturated pod
 *      leaves surplus work on the queue for an idle pod instead of hoarding it.
 *
 * Because reserving a slot here doesn't itself consume device budget, the
 * activity-side semaphore remains the real guarantee that the encoder is never
 * oversubscribed.
 */
export function createAmaActivitySlotSupplier(
  options: AmaSlotSupplierOptions = {},
): CustomSlotSupplier<ActivitySlotInfo> {
  const budget = options.budget ?? amaDeviceBudget;
  const maxConcurrent = options.maxConcurrent ?? AMA_MAX_CONCURRENT;
  const minSessions = options.minSessions ?? MIN_SLOT_SESSIONS;
  const minPixels = options.minPixels ?? MIN_SLOT_PIXELS;

  let issued = 0;

  const canIssue = () =>
    issued < maxConcurrent &&
    budget.freeSessions() >= minSessions &&
    budget.freePixels() >= minPixels;

  return {
    type: 'custom',

    async reserveSlot(_ctx, abortSignal): Promise<SlotPermit> {
      while (!canIssue()) {
        // Rejects with an AbortError if the SDK abandons this reservation.
        await budgetChanges.wait(abortSignal);
      }
      issued += 1;
      return {};
    },

    tryReserveSlot(): SlotPermit | null {
      if (!canIssue()) {
        return null;
      }
      issued += 1;
      return {};
    },

    markSlotUsed(): void {
      // No-op: the activity claims encode budget itself once it has the probe.
    },

    releaseSlot(): void {
      issued = Math.max(0, issued - 1);
      // A freed slot may let a parked reserveSlot (or budget acquire) proceed.
      budgetChanges.notify();
    },
  };
}
