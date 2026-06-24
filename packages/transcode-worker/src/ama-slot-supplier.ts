import {
  AMA_MAX_CONCURRENT,
  type AmaEncodeBudget,
  amaEncodeBudget,
  budgetChanges,
  MIN_SLOT_BUDGET,
} from '@letschurch/temporal/util/ama-budget';
import type {
  ActivitySlotInfo,
  CustomSlotSupplier,
  SlotPermit,
} from '@temporalio/worker';

export type AmaSlotSupplierOptions = {
  /** Encode budget to gate against. Defaults to the per-process singleton. */
  budget?: AmaEncodeBudget;
  /** Max concurrently pulled tasks. Defaults to `AMA_MAX_CONCURRENT`. */
  maxConcurrent?: number;
  /** Free-budget threshold below which polling stops. Defaults to `MIN_SLOT_BUDGET`. */
  minSlotBudget?: number;
};

/**
 * A Temporal custom slot supplier that gates how many transcode activities this
 * AMA worker pulls off the queue.
 *
 * The supplier is deliberately a coarse gate: it can't see a task's resolution
 * at reservation time (the probe only reaches the activity body), so it does
 * NOT do the precise per-job weighting — that lives in the activity, which
 * claims `amaEncodeBudget` before running ffmpeg. Here we only:
 *
 *   1. cap concurrent pulled tasks at `AMA_MAX_CONCURRENT`, bounding how many
 *      jobs can sit waiting for budget on one pod, and
 *   2. stop polling entirely once the device has less than the cheapest video
 *      job's worth of budget free, so a saturated pod leaves surplus work on the
 *      queue for an idle pod instead of hoarding it.
 *
 * Because reserving a slot here doesn't itself consume encode budget, the
 * activity-side semaphore remains the real guarantee that the encoder is never
 * oversubscribed.
 */
export function createAmaActivitySlotSupplier(
  options: AmaSlotSupplierOptions = {},
): CustomSlotSupplier<ActivitySlotInfo> {
  const budget = options.budget ?? amaEncodeBudget;
  const maxConcurrent = options.maxConcurrent ?? AMA_MAX_CONCURRENT;
  const minSlotBudget = options.minSlotBudget ?? MIN_SLOT_BUDGET;

  let issued = 0;

  const canIssue = () =>
    issued < maxConcurrent && budget.free() >= minSlotBudget;

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
