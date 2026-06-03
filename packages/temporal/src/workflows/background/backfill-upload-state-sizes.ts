import {
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
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
};

/**
 * Workflow to backfill file sizes for UploadState records from S3.
 *
 * Strategy:
 * - Process records in batches to avoid memory issues
 * - Use continue-as-new every 100 batches to prevent workflow history from growing too large
 * - Configurable batch size and delay between batches
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
  } = params;

  let currentUpdated = totalUpdated;
  let currentSkipped = totalSkipped;
  let currentBatchesCompleted = batchesCompleted;
  let remaining = await getBackfillSizesCount();

  // Set up query handler for progress
  setHandler(getBackfillSizesProgressQuery, () => ({
    totalUpdated: currentUpdated,
    totalSkipped: currentSkipped,
    remaining,
    batchesCompleted: currentBatchesCompleted,
  }));

  // Process batches until done
  // Use continue-as-new every 100 batches to keep workflow history manageable
  const maxBatchesBeforeContinueAsNew = 100;
  let batchesInThisRun = 0;

  while (remaining > 0) {
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
    );

    currentUpdated += result.updated;
    currentSkipped += result.skipped;
    remaining = result.remaining;
    currentBatchesCompleted += 1;
    batchesInThisRun += 1;

    // If we've processed enough batches, continue-as-new to prevent history bloat
    if (batchesInThisRun >= maxBatchesBeforeContinueAsNew && remaining > 0) {
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
      });
    }

    // Add delay between batches to avoid overwhelming the database/S3
    if (remaining > 0 && delayBetweenBatchesMs > 0) {
      await sleep(delayBetweenBatchesMs);
    }
  }

  return {
    totalUpdated: currentUpdated,
    totalSkipped: currentSkipped,
    batchesCompleted: currentBatchesCompleted,
  };
}
