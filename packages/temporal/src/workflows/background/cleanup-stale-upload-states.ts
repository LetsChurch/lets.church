import {
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import { getCleanupProgressQuery } from '../../refs';

export { getCleanupProgressQuery };

const { getStaleUploadStatesCount, cleanupStaleUploadStatesBatch } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
    heartbeatTimeout: '2 minutes',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 3 },
  });

export type CleanupStaleUploadStatesWorkflowParams = {
  batchSize: number;
  delayBetweenBatchesMs: number;
  olderThanDays: number;
  maxRows?: number;
  // For continue-as-new tracking
  totalDeleted?: number;
  batchesCompleted?: number;
};

/**
 * Workflow to clean up stale UploadState records that are not backed up
 * and older than a specified threshold.
 *
 * Strategy:
 * - Process records in batches to avoid memory issues
 * - Use continue-as-new every 100 batches to prevent workflow history from growing too large
 * - Configurable batch size, delay, and age threshold
 */
export async function cleanupStaleUploadStatesWorkflow(
  params: CleanupStaleUploadStatesWorkflowParams,
): Promise<{
  totalDeleted: number;
  batchesCompleted: number;
}> {
  const {
    batchSize,
    delayBetweenBatchesMs,
    olderThanDays,
    maxRows,
    totalDeleted = 0,
    batchesCompleted = 0,
  } = params;

  let currentDeleted = totalDeleted;
  let currentBatchesCompleted = batchesCompleted;
  let remaining = await getStaleUploadStatesCount(olderThanDays);

  // Set up query handler for progress
  setHandler(getCleanupProgressQuery, () => ({
    totalDeleted: currentDeleted,
    remaining,
    batchesCompleted: currentBatchesCompleted,
  }));

  // Process batches until done
  // Use continue-as-new every 100 batches to keep workflow history manageable
  const maxBatchesBeforeContinueAsNew = 100;
  let batchesInThisRun = 0;

  while (remaining > 0) {
    // Check if we've hit the maxRows limit
    if (maxRows !== undefined && currentDeleted >= maxRows) {
      break;
    }

    const result = await cleanupStaleUploadStatesBatch(
      batchSize,
      olderThanDays,
    );

    currentDeleted += result.deleted;
    remaining = result.remaining;
    currentBatchesCompleted += 1;
    batchesInThisRun += 1;

    // If we've processed enough batches, continue-as-new to prevent history bloat
    if (batchesInThisRun >= maxBatchesBeforeContinueAsNew && remaining > 0) {
      // Check maxRows limit before continuing
      if (maxRows !== undefined && currentDeleted >= maxRows) {
        break;
      }

      await continueAsNew<typeof cleanupStaleUploadStatesWorkflow>({
        batchSize,
        delayBetweenBatchesMs,
        olderThanDays,
        maxRows,
        totalDeleted: currentDeleted,
        batchesCompleted: currentBatchesCompleted,
      });
    }

    // Add delay between batches to avoid overwhelming the database
    if (remaining > 0 && delayBetweenBatchesMs > 0) {
      await sleep(delayBetweenBatchesMs);
    }
  }

  return {
    totalDeleted: currentDeleted,
    batchesCompleted: currentBatchesCompleted,
  };
}
