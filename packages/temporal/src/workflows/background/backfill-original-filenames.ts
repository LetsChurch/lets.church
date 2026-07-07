import {
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { getBackfillFilenamesProgressQuery } from '../../refs';

export { getBackfillFilenamesProgressQuery };

const { backfillFilenamesBatch, getBackfillFilenamesCount } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: '5 minutes',
});

export type BackfillFilenamesWorkflowParams = {
  batchSize: number;
  delayBetweenBatchesMs: number;
  maxRows?: number;
  totalProcessed?: number;
  totalUpdated?: number;
  batchesCompleted?: number;
};

export async function backfillFilenamesWorkflow(
  params: BackfillFilenamesWorkflowParams,
) {
  const {
    batchSize,
    delayBetweenBatchesMs,
    maxRows,
    totalProcessed = 0,
    totalUpdated = 0,
    batchesCompleted = 0,
  } = params;

  let currentProcessed = totalProcessed;
  let currentUpdated = totalUpdated;
  let currentBatchesCompleted = batchesCompleted;
  let remaining = await getBackfillFilenamesCount();

  // Set up query handler
  setHandler(getBackfillFilenamesProgressQuery, () => ({
    totalProcessed: currentProcessed,
    totalUpdated: currentUpdated,
    remaining,
    batchesCompleted: currentBatchesCompleted,
  }));

  const maxBatchesBeforeContinueAsNew = 100;
  let batchesInThisRun = 0;

  while (remaining > 0) {
    if (maxRows !== undefined && currentProcessed >= maxRows) {
      break;
    }

    const result = await backfillFilenamesBatch(batchSize);
    currentProcessed += result.processed;
    currentUpdated += result.updated;
    remaining = result.remaining;
    currentBatchesCompleted += 1;
    batchesInThisRun += 1;

    // Continue-as-new to prevent history bloat
    if (batchesInThisRun >= maxBatchesBeforeContinueAsNew && remaining > 0) {
      await continueAsNew<typeof backfillFilenamesWorkflow>({
        ...params,
        totalProcessed: currentProcessed,
        totalUpdated: currentUpdated,
        batchesCompleted: currentBatchesCompleted,
      });
    }

    if (remaining > 0 && delayBetweenBatchesMs > 0) {
      await sleep(delayBetweenBatchesMs);
    }
  }

  return {
    totalProcessed: currentProcessed,
    totalUpdated: currentUpdated,
  };
}
