import {
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import { getBackfillProgressQuery } from '../../refs';

export { getBackfillProgressQuery };

const { getBackfillCount, backfillUploadStatesBatch } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '2 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export type BackfillUploadStatesWorkflowParams = {
  batchSize: number;
  delayBetweenBatchesMs: number;
  ingestBucket: string;
  maxRows?: number;
  // For continue-as-new tracking
  totalCreated?: number;
  batchesCompleted?: number;
};

/**
 * Workflow to backfill UploadState records from existing database records.
 *
 * Strategy:
 * - Process records in batches to avoid memory issues
 * - Use continue-as-new every 100 batches to prevent workflow history from growing too large
 * - Configurable batch size and delay between batches
 */
export async function backfillUploadStatesWorkflow(
  params: BackfillUploadStatesWorkflowParams,
): Promise<{
  totalCreated: number;
  batchesCompleted: number;
}> {
  const {
    batchSize,
    delayBetweenBatchesMs,
    ingestBucket,
    maxRows,
    totalCreated = 0,
    batchesCompleted = 0,
  } = params;

  let currentCreated = totalCreated;
  let currentBatchesCompleted = batchesCompleted;
  let remaining = await getBackfillCount();

  // Set up query handler for progress
  setHandler(getBackfillProgressQuery, () => ({
    totalCreated: currentCreated,
    remaining,
    batchesCompleted: currentBatchesCompleted,
  }));

  // Process batches until done
  // Use continue-as-new every 100 batches to keep workflow history manageable
  const maxBatchesBeforeContinueAsNew = 100;
  let batchesInThisRun = 0;

  while (remaining > 0) {
    // Check if we've hit the maxRows limit
    if (maxRows !== undefined && currentCreated >= maxRows) {
      break;
    }

    const result = await backfillUploadStatesBatch(batchSize, ingestBucket);

    currentCreated += result.created;
    remaining = result.remaining;
    currentBatchesCompleted += 1;
    batchesInThisRun += 1;

    // If we've processed enough batches, continue-as-new to prevent history bloat
    if (batchesInThisRun >= maxBatchesBeforeContinueAsNew && remaining > 0) {
      // Check maxRows limit before continuing
      if (maxRows !== undefined && currentCreated >= maxRows) {
        break;
      }

      await continueAsNew<typeof backfillUploadStatesWorkflow>({
        batchSize,
        delayBetweenBatchesMs,
        ingestBucket,
        maxRows,
        totalCreated: currentCreated,
        batchesCompleted: currentBatchesCompleted,
      });
    }

    // Add delay between batches to avoid overwhelming the database
    if (remaining > 0 && delayBetweenBatchesMs > 0) {
      await sleep(delayBetweenBatchesMs);
    }
  }

  return {
    totalCreated: currentCreated,
    batchesCompleted: currentBatchesCompleted,
  };
}
