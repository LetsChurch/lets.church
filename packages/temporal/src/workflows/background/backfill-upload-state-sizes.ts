import {
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import type { BackfillSizesCursor } from '../../activities/background/backfill-upload-state-sizes';
import { BACKGROUND_QUEUE } from '../../queues';
import { getBackfillSizesProgressQuery } from '../../refs';

export { getBackfillSizesProgressQuery };

const { getBackfillSizesCount, backfillUploadStateSizesBatch } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
    heartbeatTimeout: '2 minutes',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 3 },
  });

export type BackfillUploadStateSizesWorkflowParams = {
  batchSize: number;
  delayBetweenBatchesMs: number;
  ingestBucket: string;
  ingestEndpoint: string;
  ingestRegion: string;
  ingestAccessKeyId: string;
  ingestSecretAccessKey: string;
  maxRows?: number;
  // For continue-as-new tracking
  totalUpdated?: number;
  totalSkipped?: number;
  batchesCompleted?: number;
  // Keyset pagination cursor carried across continue-as-new hops.
  cursor?: BackfillSizesCursor | null;
};

/**
 * Workflow to backfill file sizes for UploadState records from S3.
 *
 * Strategy:
 * - Process records in batches, paging forward with a keyset cursor so every
 *   row is examined exactly once. This guarantees forward progress and
 *   termination even when some rows can never be resolved (missing S3 object
 *   or bucket mismatch) — those stay NULL and are stepped past rather than
 *   re-selected forever (which previously wedged this workflow in an infinite
 *   loop, since `remaining` never dropped below the count of unresolvable rows).
 * - Use continue-as-new every 100 batches to prevent workflow history from
 *   growing too large.
 * - Configurable batch size and delay between batches.
 */
export async function backfillUploadStateSizesWorkflow(
  params: BackfillUploadStateSizesWorkflowParams,
): Promise<{
  totalUpdated: number;
  totalSkipped: number;
  batchesCompleted: number;
}> {
  const {
    batchSize,
    delayBetweenBatchesMs,
    ingestBucket,
    ingestEndpoint,
    ingestRegion,
    ingestAccessKeyId,
    ingestSecretAccessKey,
    maxRows,
    totalUpdated = 0,
    totalSkipped = 0,
    batchesCompleted = 0,
    cursor = null,
  } = params;

  let currentUpdated = totalUpdated;
  let currentSkipped = totalSkipped;
  let currentBatchesCompleted = batchesCompleted;
  let currentCursor = cursor;
  // Informational only — reflects rows still lacking a size (including
  // unresolvable ones), so it is not used as the loop's stop condition.
  let remaining = await getBackfillSizesCount();

  // Set up query handler for progress
  setHandler(getBackfillSizesProgressQuery, () => ({
    totalUpdated: currentUpdated,
    totalSkipped: currentSkipped,
    remaining,
    batchesCompleted: currentBatchesCompleted,
  }));

  // Process batches until the keyset cursor reaches the end of the NULL set.
  // Use continue-as-new every 100 batches to keep workflow history manageable.
  const maxBatchesBeforeContinueAsNew = 100;
  let batchesInThisRun = 0;

  for (;;) {
    // Check if we've hit the maxRows limit
    if (maxRows !== undefined && currentUpdated >= maxRows) {
      break;
    }

    const result = await backfillUploadStateSizesBatch(
      batchSize,
      ingestBucket,
      ingestEndpoint,
      ingestRegion,
      ingestAccessKeyId,
      ingestSecretAccessKey,
      currentCursor,
    );

    currentUpdated += result.updated;
    currentSkipped += result.skipped;
    remaining = result.remaining;
    currentCursor = result.nextCursor;
    currentBatchesCompleted += 1;
    batchesInThisRun += 1;

    // Reached the end of the NULL set — nothing left to page through.
    if (result.done) {
      break;
    }

    // If we've processed enough batches, continue-as-new to prevent history bloat
    if (batchesInThisRun >= maxBatchesBeforeContinueAsNew) {
      // Check maxRows limit before continuing
      if (maxRows !== undefined && currentUpdated >= maxRows) {
        break;
      }

      await continueAsNew<typeof backfillUploadStateSizesWorkflow>({
        batchSize,
        delayBetweenBatchesMs,
        ingestBucket,
        ingestEndpoint,
        ingestRegion,
        ingestAccessKeyId,
        ingestSecretAccessKey,
        maxRows,
        totalUpdated: currentUpdated,
        totalSkipped: currentSkipped,
        batchesCompleted: currentBatchesCompleted,
        cursor: currentCursor,
      });
    }

    // Add delay between batches to avoid overwhelming the database/S3
    if (delayBetweenBatchesMs > 0) {
      await sleep(delayBetweenBatchesMs);
    }
  }

  return {
    totalUpdated: currentUpdated,
    totalSkipped: currentSkipped,
    batchesCompleted: currentBatchesCompleted,
  };
}
