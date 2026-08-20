import {
  Channel,
  db,
  Organization,
  SpeakerAttribution,
  UploadRecord,
} from '@letschurch/db';
import {
  client,
  MEDIA_INDEX,
  SPEAKER_VECTOR_INDEX,
} from '@letschurch/opensearch';
import { heartbeat } from '@temporalio/activity';
import {
  and,
  asc,
  type Column,
  count,
  countDistinct,
  gt,
  gte,
  isNotNull,
  lt,
} from 'drizzle-orm';
import pMap from 'p-map';

import logger from '../../util/logger';
import indexDocument from './index-document';
import { syncSpeakerVectors } from './sync-speaker-vectors';

// `media` → lc_media_v1 (the unified search index; also re-syncs the upload's
// speaker vectors as a side effect). `speaker` → lc_speaker_vectors only (for
// uploads with attributions but no summary embedding, which the media pass
// skips). `channel`/`organization` index the standalone lc_channels /
// lc_organizations.
export type ReindexKind = 'channel' | 'organization' | 'media' | 'speaker';

export type ReindexBatchParams = {
  kind: ReindexKind;
  /** Inclusive lower bound of this shard's uuid range (see util/uuid-shards). */
  lo: string;
  /** Exclusive upper bound; null on the last shard. */
  hi: string | null;
  /**
   * Keyset cursor — the last id this shard indexed, exclusive. Null starts the
   * shard at `lo`. Keyset rather than OFFSET because OFFSET makes Postgres walk
   * and discard `offset` rows on every batch, so cost grows as the scan
   * advances; `id > $cursor` on the PK index starts each batch where the last
   * one stopped, at constant cost.
   */
  after: string | null;
  batchSize: number;
  /** Documents indexed concurrently within the batch. */
  concurrency: number;
};

export type ReindexBatchResult = {
  indexed: number;
  /** Cursor to pass as `after` on the next batch; null when the shard is done. */
  lastId: string | null;
  hasMore: boolean;
};

const moduleLogger = logger.child({
  module: 'temporal/activities/background/reindex',
});

export async function getReindexCount(kind: ReindexKind): Promise<number> {
  const countCol = count();
  switch (kind) {
    case 'channel': {
      const r = await db.select({ count: countCol }).from(Channel);
      return r[0]?.count ?? 0;
    }
    case 'organization': {
      const r = await db.select({ count: countCol }).from(Organization);
      return r[0]?.count ?? 0;
    }
    case 'media': {
      // Only uploads with a summary embedding produce an lc_media_v1 doc; the
      // rest are skipped by indexDocument('media'), so don't count them.
      const r = await db
        .select({ count: countCol })
        .from(UploadRecord)
        .where(isNotNull(UploadRecord.summaryEmbedding));
      return r[0]?.count ?? 0;
    }
    case 'speaker': {
      const r = await db
        .select({
          count: countDistinct(SpeakerAttribution.uploadRecordId),
        })
        .from(SpeakerAttribution);
      return r[0]?.count ?? 0;
    }
  }
}

/**
 * Half-open shard range plus keyset cursor, as a predicate on the batch's id
 * column. `and()` drops the undefined, so the final shard stays unbounded above.
 */
function cursorWhere(
  col: Column,
  { lo, hi, after }: Pick<ReindexBatchParams, 'lo' | 'hi' | 'after'>,
) {
  return and(
    after ? gt(col, after) : gte(col, lo),
    hi ? lt(col, hi) : undefined,
  );
}

async function selectBatch({
  kind,
  lo,
  hi,
  after,
  batchSize,
}: Omit<ReindexBatchParams, 'concurrency'>): Promise<Array<{ id: string }>> {
  switch (kind) {
    case 'channel':
      return db
        .select({ id: Channel.id })
        .from(Channel)
        .where(cursorWhere(Channel.id, { lo, hi, after }))
        .orderBy(asc(Channel.id))
        .limit(batchSize);
    case 'organization':
      return db
        .select({ id: Organization.id })
        .from(Organization)
        .where(cursorWhere(Organization.id, { lo, hi, after }))
        .orderBy(asc(Organization.id))
        .limit(batchSize);
    case 'media':
      return db
        .select({ id: UploadRecord.id })
        .from(UploadRecord)
        .where(
          and(
            cursorWhere(UploadRecord.id, { lo, hi, after }),
            isNotNull(UploadRecord.summaryEmbedding),
          ),
        )
        .orderBy(asc(UploadRecord.id))
        .limit(batchSize);
    case 'speaker':
      // Distinct uploads that have at least one speaker attribution.
      return db
        .selectDistinct({ id: SpeakerAttribution.uploadRecordId })
        .from(SpeakerAttribution)
        .where(
          cursorWhere(SpeakerAttribution.uploadRecordId, { lo, hi, after }),
        )
        .orderBy(asc(SpeakerAttribution.uploadRecordId))
        .limit(batchSize);
  }
}

export async function reindexBatch(
  params: ReindexBatchParams,
): Promise<ReindexBatchResult> {
  const { kind, concurrency, batchSize } = params;
  const rows = await selectBatch(params);

  let indexed = 0;
  let done = 0;

  // Concurrent, not serial: per-document work is almost entirely I/O wait
  // (Postgres reads, the window embed, the OpenSearch write), so the batch's
  // wall clock was previously the *sum* of ~50 round trips. `refresh: false`
  // because the reindex refreshes once at the end (see `refreshReindexTargets`)
  // rather than flushing a segment per document.
  await pMap(
    rows,
    async ({ id }) => {
      try {
        if (kind === 'speaker') {
          await syncSpeakerVectors(id, { refresh: false });
        } else {
          // `kind` is narrowed to a DocumentKind here ('speaker' handled above).
          await indexDocument(kind, id, { refresh: false });
        }
        indexed++;
      } catch (err) {
        moduleLogger.error(
          `Failed to index document ${id} (${kind}), skipping: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      done++;
      heartbeat({ done, total: rows.length });
    },
    { concurrency },
  );

  moduleLogger.info(
    `Reindex batch complete: kind=${kind} after=${params.after ?? params.lo} indexed=${indexed}`,
  );

  return {
    indexed,
    lastId: rows.at(-1)?.id ?? null,
    hasMore: rows.length === batchSize,
  };
}

/**
 * Refresh the indices a reindex of `kind` wrote to, making the whole pass
 * visible at once. The per-document writes run with `refresh: false`, so this is
 * what replaces them — one flush per run instead of two per document.
 */
export async function refreshReindexTargets(kind: ReindexKind): Promise<void> {
  const indices: Record<ReindexKind, string[]> = {
    channel: ['lc_channels'],
    organization: ['lc_organizations'],
    media: [MEDIA_INDEX, SPEAKER_VECTOR_INDEX],
    speaker: [SPEAKER_VECTOR_INDEX],
  };
  await client.indices.refresh({ index: indices[kind].join(',') });
}
