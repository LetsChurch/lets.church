import {
  continueAsNew,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import { BACKGROUND_QUEUE } from '../../queues';
import { getBackfillScriptureRefsProgressQuery } from '../../refs';
import { uuidShards } from '../../util/uuid-shards';

export { getBackfillScriptureRefsProgressQuery };

const {
  backfillScriptureRefsBatch,
  getBackfillScriptureRefsCount,
  refreshReindexTargets,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  // Each upload heartbeats; a slow one is a long transcript's quote match
  // plus a warm reindex, well under this.
  heartbeatTimeout: '2 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export type BackfillScriptureRefsWorkflowParams = {
  batchSize?: number;
  shards?: number;
  // Carried across continueAsNew
  cursors?: Array<string | null>;
  doneShards?: number[];
  processed?: number;
  changed?: number;
  total?: number;
};

const DEFAULT_BATCH_SIZE = 50;
// No LLM or embedding calls (the reindex is warm), so the database is the
// limit; this matches the reindex's default in-flight width.
const DEFAULT_SHARDS = 8;
const MAX_BATCHES_BEFORE_CONTINUE_AS_NEW = 100;

/**
 * Bring every transcribed upload's BIBLE annotations up to the layered
 * Scripture-reference pipeline (explicit citations, book-implied mentions,
 * quotations, versification checks) without re-running the LLM, and reindex
 * the ones that changed so the verse/book facets follow. Idempotent.
 */
export async function backfillScriptureRefsWorkflow(
  params: BackfillScriptureRefsWorkflowParams,
): Promise<{ processed: number; changed: number }> {
  const { batchSize = DEFAULT_BATCH_SIZE, shards = DEFAULT_SHARDS } = params;
  const allShards = uuidShards(shards);
  const cursors: Array<string | null> =
    params.cursors ?? allShards.map(() => null);
  const doneShards = new Set(params.doneShards ?? []);
  let processed = params.processed ?? 0;
  let changed = params.changed ?? 0;
  const total = params.total ?? (await getBackfillScriptureRefsCount());
  let batchesInThisRun = 0;

  setHandler(getBackfillScriptureRefsProgressQuery, () => ({
    processed,
    changed,
    activeShards: allShards.length - doneShards.size,
    total,
  }));

  while (doneShards.size < allShards.length) {
    const active = allShards.filter((s) => !doneShards.has(s.index));
    const results = await Promise.all(
      active.map((shard) =>
        backfillScriptureRefsBatch({
          lo: shard.lo,
          hi: shard.hi,
          after: cursors[shard.index] ?? null,
          batchSize,
        }),
      ),
    );
    for (const [i, result] of results.entries()) {
      const shard = active[i];
      if (!shard) continue;
      processed += result.processed;
      changed += result.changed;
      if (result.lastId) cursors[shard.index] = result.lastId;
      if (!result.hasMore) doneShards.add(shard.index);
    }
    batchesInThisRun += results.length;

    if (
      batchesInThisRun >= MAX_BATCHES_BEFORE_CONTINUE_AS_NEW &&
      doneShards.size < allShards.length
    ) {
      await continueAsNew<typeof backfillScriptureRefsWorkflow>({
        batchSize,
        shards,
        cursors,
        doneShards: [...doneShards],
        processed,
        changed,
        total,
      });
    }
  }

  // The reindexes ran with refresh: false; make them visible now.
  await refreshReindexTargets('media');
  return { processed, changed };
}
