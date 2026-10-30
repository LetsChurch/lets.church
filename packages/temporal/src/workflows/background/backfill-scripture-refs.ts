import {
  continueAsNew,
  proxyActivities,
  setHandler,
  sleep,
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

// Retries without limit: if OpenSearch is unreachable the backfill should
// wait it out, not fail and lose its place.
const { getSearchDiskUsedPercent } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumInterval: '5 minutes' },
});

export type BackfillScriptureRefsWorkflowParams = {
  batchSize?: number;
  shards?: number;
  /** Pause while OpenSearch disk usage is at or above this percent. */
  maxDiskPercent?: number;
  // Carried across continueAsNew
  cursors?: Array<string | null>;
  doneShards?: number[];
  processed?: number;
  changed?: number;
  total?: number;
};

const DEFAULT_BATCH_SIZE = 50;
// The limit is OpenSearch merging, not the database: each changed upload
// rewrites a ~2.4 MB media doc, and at 8 shards (~300 uploads/min) deleted
// copies piled up faster than merges expunged them until the 300Gi volume
// filled and lc_media_v1 went offline (2026-10-29). Two shards plus the disk
// check below keep the backlog bounded.
const DEFAULT_SHARDS = 2;
// OpenSearch blocks writes at its 95% flood stage, and in-flight merges
// temporarily need extra room for the segments they write, so pause well
// short of that.
const DEFAULT_MAX_DISK_PERCENT = 80;
const DISK_RECHECK_INTERVAL = '5 minutes';
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
  const {
    batchSize = DEFAULT_BATCH_SIZE,
    shards = DEFAULT_SHARDS,
    maxDiskPercent = DEFAULT_MAX_DISK_PERCENT,
  } = params;
  const allShards = uuidShards(shards);
  const cursors: Array<string | null> =
    params.cursors ?? allShards.map(() => null);
  const doneShards = new Set(params.doneShards ?? []);
  let processed = params.processed ?? 0;
  let changed = params.changed ?? 0;
  const total = params.total ?? (await getBackfillScriptureRefsCount());
  let batchesInThisRun = 0;
  let diskPercent: number | null = null;
  let paused = false;

  setHandler(getBackfillScriptureRefsProgressQuery, () => ({
    processed,
    changed,
    activeShards: allShards.length - doneShards.size,
    total,
    diskPercent,
    paused,
  }));

  while (doneShards.size < allShards.length) {
    diskPercent = await getSearchDiskUsedPercent();
    paused = diskPercent >= maxDiskPercent;
    if (paused) {
      await sleep(DISK_RECHECK_INTERVAL);
      // Count waits toward the history budget so a long pause still
      // continues-as-new instead of growing one history without bound.
      batchesInThisRun += 1;
    } else {
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
    }

    if (
      batchesInThisRun >= MAX_BATCHES_BEFORE_CONTINUE_AS_NEW &&
      doneShards.size < allShards.length
    ) {
      await continueAsNew<typeof backfillScriptureRefsWorkflow>({
        batchSize,
        shards,
        maxDiskPercent,
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
