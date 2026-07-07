import {
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import { getBackfillOriginalImagesProgressQuery } from '../../refs';

export { getBackfillOriginalImagesProgressQuery };

const { backfillOriginalImageUploadStatesBatch } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '2 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export type BackfillOriginalImageUploadStatesWorkflowParams = {
  batchSize: number;
  delayBetweenBatchesMs: number;
  ingestBucket: string;
  // For continue-as-new tracking
  totalCreated?: number;
  batchesCompleted?: number;
};

/**
 * Workflow to backfill UploadState records for original image files in the ingest bucket.
 * Scans for .imagemagick.json probe files to identify originals.
 *
 * Strategy:
 * - List objects in ingest bucket looking for .imagemagick.json files
 * - For each probe file, check if original exists and create UploadState
 * - Use continuation tokens to paginate through large buckets
 * - Use continue-as-new every 100 batches to prevent workflow history from growing too large
 */
export async function backfillOriginalImageUploadStatesWorkflow(
  params: BackfillOriginalImageUploadStatesWorkflowParams,
): Promise<{
  totalCreated: number;
  batchesCompleted: number;
}> {
  const {
    batchSize,
    delayBetweenBatchesMs,
    ingestBucket,
    totalCreated = 0,
    batchesCompleted = 0,
  } = params;

  let currentCreated = totalCreated;
  let currentBatchesCompleted = batchesCompleted;
  let remaining = batchSize; // Start with assumption there's work

  // Set up query handler for progress
  setHandler(getBackfillOriginalImagesProgressQuery, () => ({
    totalCreated: currentCreated,
    batchesCompleted: currentBatchesCompleted,
  }));

  // Process batches until done
  // Use continue-as-new every 100 batches to keep workflow history manageable
  const maxBatchesBeforeContinueAsNew = 100;
  let batchesInThisRun = 0;

  while (remaining > 0) {
    const result = await backfillOriginalImageUploadStatesBatch(
      batchSize,
      ingestBucket,
    );

    currentCreated += result.created;
    remaining = result.remaining;
    currentBatchesCompleted += 1;
    batchesInThisRun += 1;

    // If we've processed enough batches, continue-as-new to prevent history bloat
    if (batchesInThisRun >= maxBatchesBeforeContinueAsNew && remaining > 0) {
      await continueAsNew<typeof backfillOriginalImageUploadStatesWorkflow>({
        batchSize,
        delayBetweenBatchesMs,
        ingestBucket,
        totalCreated: currentCreated,
        batchesCompleted: currentBatchesCompleted,
      });
    }

    // Add delay between batches to avoid overwhelming S3 and the database
    if (remaining > 0 && delayBetweenBatchesMs > 0) {
      await sleep(delayBetweenBatchesMs);
    }
  }

  return {
    totalCreated: currentCreated,
    batchesCompleted: currentBatchesCompleted,
  };
}
