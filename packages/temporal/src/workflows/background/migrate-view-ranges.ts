import {
  continueAsNew,
  defineQuery,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';

const { getMigrationCount, migrateViewRangesBatch } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '5 minutes',
  heartbeatTimeout: '2 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

// Query to get current progress
export const getMigrationProgressQuery = defineQuery<{
  totalProcessed: number;
  totalSecondsCreated: number;
  remaining: number;
  batchesCompleted: number;
}>('getMigrationProgress');

export type MigrateViewRangesWorkflowParams = {
  batchSize: number;
  delayBetweenBatchesMs: number;
  maxRows?: number;
  // For continue-as-new tracking
  totalProcessed?: number;
  totalSecondsCreated?: number;
  batchesCompleted?: number;
};

/**
 * Workflow to migrate UploadViewRanges to UploadViewSecond
 *
 * Strategy:
 * - Process rows in batches to avoid memory issues
 * - Use continue-as-new every 100 batches to prevent workflow history from growing too large
 * - Each batch is processed transactionally
 * - Configurable batch size and delay between batches
 */
export async function migrateViewRangesWorkflow(
  params: MigrateViewRangesWorkflowParams,
): Promise<{
  totalProcessed: number;
  totalSecondsCreated: number;
  batchesCompleted: number;
}> {
  const {
    batchSize,
    delayBetweenBatchesMs,
    maxRows,
    totalProcessed = 0,
    totalSecondsCreated = 0,
    batchesCompleted = 0,
  } = params;

  let currentProcessed = totalProcessed;
  let currentSecondsCreated = totalSecondsCreated;
  let currentBatchesCompleted = batchesCompleted;
  let remaining = await getMigrationCount();

  // Set up query handler for progress
  setHandler(getMigrationProgressQuery, () => ({
    totalProcessed: currentProcessed,
    totalSecondsCreated: currentSecondsCreated,
    remaining,
    batchesCompleted: currentBatchesCompleted,
  }));

  // Process batches until done
  // Use continue-as-new every 100 batches to keep workflow history manageable
  const maxBatchesBeforeContinueAsNew = 100;
  let batchesInThisRun = 0;

  while (remaining > 0) {
    // Check if we've hit the maxRows limit
    if (maxRows !== undefined && currentProcessed >= maxRows) {
      break;
    }

    const result = await migrateViewRangesBatch(batchSize);

    currentProcessed += result.processed;
    currentSecondsCreated += result.secondsCreated;
    remaining = result.remaining;
    currentBatchesCompleted += 1;
    batchesInThisRun += 1;

    // If we've processed enough batches, continue-as-new to prevent history bloat
    if (batchesInThisRun >= maxBatchesBeforeContinueAsNew && remaining > 0) {
      // Check maxRows limit before continuing
      if (maxRows !== undefined && currentProcessed >= maxRows) {
        break;
      }

      await continueAsNew<typeof migrateViewRangesWorkflow>({
        batchSize,
        delayBetweenBatchesMs,
        maxRows,
        totalProcessed: currentProcessed,
        totalSecondsCreated: currentSecondsCreated,
        batchesCompleted: currentBatchesCompleted,
      });
    }

    // Add delay between batches to avoid overwhelming the database
    if (remaining > 0 && delayBetweenBatchesMs > 0) {
      await sleep(delayBetweenBatchesMs);
    }
  }

  return {
    totalProcessed: currentProcessed,
    totalSecondsCreated: currentSecondsCreated,
    batchesCompleted: currentBatchesCompleted,
  };
}
