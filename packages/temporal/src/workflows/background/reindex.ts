import {
  continueAsNew,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';

import type * as activities from '../../activities/background';
import type { ReindexKind } from '../../activities/background/reindex';
import { BACKGROUND_QUEUE } from '../../queues';
import { getReindexProgressQuery } from '../../refs';
import { uuidShards } from '../../util/uuid-shards';

export { getReindexProgressQuery };

const { reindexBatch, getReindexCount, refreshReindexTargets } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '10 minutes',
    // Generous relative to a healthy batch (which heartbeats every document, a
    // second or two apart) because the floor isn't throughput, it's a single
    // document's worst case: an embed call retrying through 429 backoff can
    // stall one document for minutes. At 2 minutes those stalls read as a dead
    // worker, so Temporal killed and retried batches that were making fine
    // progress — turning a slowdown into thrash.
    heartbeatTimeout: '5 minutes',
    taskQueue: BACKGROUND_QUEUE,
    retry: { maximumAttempts: 3 },
  });

export type ReindexWorkflowParams = {
  kind: ReindexKind;
  batchSize?: number;
  shards?: number;
  concurrency?: number;
  // Carried across continueAsNew
  cursors?: Array<string | null>;
  doneShards?: number[];
  totalIndexed?: number;
  total?: number;
};

const DEFAULT_BATCH_SIZE = 50;
// Shards run one batch each per round, and each batch indexes `CONCURRENCY`
// documents at a time, so peak in-flight document work is SHARDS * CONCURRENCY.
//
// The binding constraint is the OpenAI embeddings TPM budget, which is org-wide
// and shared with every other embed path. A cold reindex (no cached window
// vectors) spends roughly `windows-per-doc * ~260` tokens per document — about
// 25k for a typical sermon — so a 10M TPM budget tops out near 400 docs/min no
// matter how wide we fan out. Measured: 16 in flight lands just under that;
// 32 sailed past it, sat in 429 backoff, and blew the heartbeat timeout, which
// made batches retry and did *less* work overall.
//
// A warm reindex issues no embed calls at all and isn't TPM-bound, so these
// numbers are sized for the cold pass. Raising them only helps if the embeddings
// budget rises too. The pg pool (packages/db/src/pool.ts) is sized to match.
const DEFAULT_SHARDS = 8;
const DEFAULT_CONCURRENCY = 2;
const MAX_BATCHES_BEFORE_CONTINUE_AS_NEW = 100;

export async function reindexWorkflow(
  params: ReindexWorkflowParams,
): Promise<{ totalIndexed: number }> {
  const {
    kind,
    batchSize = DEFAULT_BATCH_SIZE,
    shards = DEFAULT_SHARDS,
    concurrency = DEFAULT_CONCURRENCY,
    totalIndexed = 0,
    total: knownTotal,
  } = params;

  const allShards = uuidShards(shards);
  // Per-shard keyset cursors, carried across continueAsNew. Each shard owns a
  // disjoint uuid range, so they advance independently.
  const cursors: Array<string | null> =
    params.cursors ?? allShards.map(() => null);
  const doneShards = new Set(params.doneShards ?? []);

  let currentIndexed = totalIndexed;
  const total = knownTotal ?? (await getReindexCount(kind));
  let batchesInThisRun = 0;

  setHandler(getReindexProgressQuery, () => ({
    totalIndexed: currentIndexed,
    // No single offset anymore — shards advance independently. Report how many
    // are still walking so progress stays legible.
    activeShards: allShards.length - doneShards.size,
    total,
  }));

  while (doneShards.size < allShards.length) {
    const active = allShards.filter((s) => !doneShards.has(s.index));

    // One batch per active shard, concurrently. Rounds are a barrier, which
    // costs little here because v4 uuids make the shards near-equal in size —
    // they stay in step on their own.
    const results = await Promise.all(
      active.map((shard) =>
        reindexBatch({
          kind,
          lo: shard.lo,
          hi: shard.hi,
          after: cursors[shard.index] ?? null,
          batchSize,
          concurrency,
        }),
      ),
    );

    for (const [i, result] of results.entries()) {
      const shard = active[i];
      if (!shard) continue;
      currentIndexed += result.indexed;
      if (result.lastId) {
        cursors[shard.index] = result.lastId;
      }
      if (!result.hasMore) {
        doneShards.add(shard.index);
      }
    }
    batchesInThisRun += results.length;

    if (
      batchesInThisRun >= MAX_BATCHES_BEFORE_CONTINUE_AS_NEW &&
      doneShards.size < allShards.length
    ) {
      // Safe to continue-as-new here and not mid-round: the Promise.all above
      // has settled, so no batch is in flight and no cursor is unrecorded.
      await continueAsNew<typeof reindexWorkflow>({
        kind,
        batchSize,
        shards,
        concurrency,
        cursors,
        doneShards: [...doneShards],
        totalIndexed: currentIndexed,
        total,
      });
    }
  }

  // Per-document writes ran with refresh: false; make the pass visible now.
  await refreshReindexTargets(kind);

  return { totalIndexed: currentIndexed };
}
