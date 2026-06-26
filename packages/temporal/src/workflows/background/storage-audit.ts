import {
  executeChild,
  proxyActivities,
  setHandler,
} from '@temporalio/workflow';
import type * as activities from '../../activities/background';
import type {
  ShardSummary,
  StorageAuditSummary,
} from '../../activities/background/storage-audit';
import { BACKGROUND_QUEUE } from '../../queues';
import {
  getStorageAuditProgressQuery,
  type StorageAuditProgress,
} from '../../refs';
import type { StorageAuditBucket } from '../../workflow-ids';

export { getStorageAuditProgressQuery };

const HEX = '0123456789abcdef'.split('');
const BUCKETS: Array<StorageAuditBucket> = ['INGEST', 'PUBLIC', 'BACKUP'];
// How many shard child workflows to keep in flight at once.
const CHILD_CONCURRENCY = 16;

const { auditShard } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 hour',
  heartbeatTimeout: '5 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

const {
  assembleStorageAuditReport,
  deleteStorageAuditReportObjects,
  finalizeStorageAuditRecord,
  getStorageAuditRecipient,
  sendStorageAuditEmail,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '15 minutes',
  taskQueue: BACKGROUND_QUEUE,
  retry: { maximumAttempts: 3 },
});

export type StorageAuditShardParams = {
  auditId: string;
  bucket: StorageAuditBucket;
  shardPrefix: string;
};

/**
 * Child workflow: audit one (bucket × hex-shard) slice. One per shard so each
 * has its own history/retry and shows up individually in the Temporal UI.
 */
export async function auditBucketShardWorkflow(
  params: StorageAuditShardParams,
): Promise<ShardSummary> {
  return auditShard(params.auditId, params.bucket, params.shardPrefix);
}

export type DeleteStorageAuditReportParams = {
  auditId: string;
};

/**
 * Purge a deleted audit's report objects from S3. The DB row is removed
 * synchronously by the web mutation; this offloads the (credentialed) S3
 * cleanup to the background worker so the web app never imports the S3 clients.
 */
export async function deleteStorageAuditReportWorkflow(
  params: DeleteStorageAuditReportParams,
): Promise<void> {
  await deleteStorageAuditReportObjects(params.auditId);
}

export type StorageAuditWorkflowParams = {
  auditId: string;
  triggeredById: string;
  // 1 → 16 shards/bucket, 2 → 256, etc. The knob to scale finer if a single
  // shard is too heavy.
  shardHexLen?: number;
};

function shardPrefixes(hexLen: number): Array<string> {
  let prefixes = [''];
  for (let i = 0; i < hexLen; i += 1) {
    prefixes = prefixes.flatMap((p) => HEX.map((h) => p + h));
  }
  return prefixes;
}

export async function storageAuditWorkflow(
  params: StorageAuditWorkflowParams,
): Promise<StorageAuditSummary> {
  const { auditId, triggeredById, shardHexLen = 1 } = params;

  const tasks = BUCKETS.flatMap((bucket) =>
    shardPrefixes(shardHexLen).map((shardPrefix) => ({ bucket, shardPrefix })),
  );
  const totalShards = tasks.length;

  let phase: StorageAuditProgress['phase'] = 'scanning';
  let shardsComplete = 0;
  let orphans = 0;
  let missing = 0;

  setHandler(getStorageAuditProgressQuery, () => ({
    phase,
    shardsComplete,
    totalShards,
    orphans,
    missing,
  }));

  try {
    const summaries: Array<ShardSummary> = [];

    for (let i = 0; i < tasks.length; i += CHILD_CONCURRENCY) {
      const batch = tasks.slice(i, i + CHILD_CONCURRENCY);
      const results = await Promise.all(
        batch.map((t) =>
          executeChild(auditBucketShardWorkflow, {
            workflowId: `storageAuditShard:${auditId}:${t.bucket}:${t.shardPrefix}`,
            taskQueue: BACKGROUND_QUEUE,
            args: [{ auditId, bucket: t.bucket, shardPrefix: t.shardPrefix }],
            retry: { maximumAttempts: 2 },
          }).then((res) => {
            shardsComplete += 1;
            for (const [k, v] of Object.entries(res.counts)) {
              if (k.startsWith('ORPHAN')) orphans += v;
              else if (k.startsWith('MISSING') || k.startsWith('BROKEN'))
                missing += v;
            }
            return res;
          }),
        ),
      );
      summaries.push(...results);
    }

    phase = 'reporting';
    const { reportKey, summary } = await assembleStorageAuditReport(
      auditId,
      summaries,
    );

    phase = 'emailing';
    const recipient = await getStorageAuditRecipient(triggeredById);
    if (recipient) {
      await sendStorageAuditEmail(recipient, summary, reportKey);
    }

    await finalizeStorageAuditRecord(
      auditId,
      'COMPLETED',
      summary,
      reportKey,
      null,
    );
    phase = 'done';
    return summary;
  } catch (err) {
    await finalizeStorageAuditRecord(
      auditId,
      'FAILED',
      null,
      null,
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}
