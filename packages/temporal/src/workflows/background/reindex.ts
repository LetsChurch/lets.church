import {
  continueAsNew,
  defineQuery,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import type { ReindexKind } from '../../activities/background/reindex';
import { BACKGROUND_QUEUE } from '../../queues';

const { reindexBatch, getReindexCount } = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '2 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export const getReindexProgressQuery = defineQuery<{
  totalIndexed: number;
  offset: number;
  total: number;
}>('getReindexProgress');

export type ReindexWorkflowParams = {
  kind: ReindexKind;
  batchSize?: number;
  // Carried across continueAsNew
  offset?: number;
  totalIndexed?: number;
  total?: number;
};

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCHES_BEFORE_CONTINUE_AS_NEW = 100;

export async function reindexWorkflow(
  params: ReindexWorkflowParams,
): Promise<{ totalIndexed: number }> {
  const {
    kind,
    batchSize = DEFAULT_BATCH_SIZE,
    offset = 0,
    totalIndexed = 0,
    total: knownTotal,
  } = params;

  let currentOffset = offset;
  let currentIndexed = totalIndexed;
  const total = knownTotal ?? (await getReindexCount(kind));
  let batchesInThisRun = 0;

  setHandler(getReindexProgressQuery, () => ({
    totalIndexed: currentIndexed,
    offset: currentOffset,
    total,
  }));

  let hasMore = true;
  while (hasMore) {
    const result = await reindexBatch(kind, currentOffset, batchSize);
    currentIndexed += result.indexed;
    currentOffset += batchSize;
    hasMore = result.hasMore;
    batchesInThisRun++;

    if (batchesInThisRun >= MAX_BATCHES_BEFORE_CONTINUE_AS_NEW && hasMore) {
      await continueAsNew<typeof reindexWorkflow>({
        kind,
        batchSize,
        offset: currentOffset,
        totalIndexed: currentIndexed,
        total,
      });
    }
  }

  return { totalIndexed: currentIndexed };
}
