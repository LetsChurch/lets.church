import {
  Channel,
  db,
  Organization,
  SpeakerAttribution,
  UploadRecord,
} from '@letschurch/db';
import { heartbeat } from '@temporalio/activity';
import { asc, isNotNull, sql } from 'drizzle-orm';

import logger from '../../util/logger';
import indexDocument from './index-document';
import { syncSpeakerVectors } from './sync-speaker-vectors';

// `media` → lc_media_v1 (the unified search index; also re-syncs the upload's
// speaker vectors as a side effect). `speaker` → lc_speaker_vectors only (for
// uploads with attributions but no summary embedding, which the media pass
// skips). `channel`/`organization` index the standalone lc_channels /
// lc_organizations.
export type ReindexKind = 'channel' | 'organization' | 'media' | 'speaker';

export type ReindexBatchResult = {
  indexed: number;
  hasMore: boolean;
};

const moduleLogger = logger.child({
  module: 'temporal/activities/background/reindex',
});

export async function getReindexCount(kind: ReindexKind): Promise<number> {
  const countCol = sql<string>`count(*)`;
  switch (kind) {
    case 'channel': {
      const r = await db.select({ count: countCol }).from(Channel);
      return Number(r[0]?.count ?? 0);
    }
    case 'organization': {
      const r = await db.select({ count: countCol }).from(Organization);
      return Number(r[0]?.count ?? 0);
    }
    case 'media': {
      // Only uploads with a summary embedding produce an lc_media_v1 doc; the
      // rest are skipped by indexDocument('media'), so don't count them.
      const r = await db
        .select({ count: countCol })
        .from(UploadRecord)
        .where(isNotNull(UploadRecord.summaryEmbedding));
      return Number(r[0]?.count ?? 0);
    }
    case 'speaker': {
      const r = await db
        .select({
          count: sql<string>`count(distinct ${SpeakerAttribution.uploadRecordId})`,
        })
        .from(SpeakerAttribution);
      return Number(r[0]?.count ?? 0);
    }
  }
}

export async function reindexBatch(
  kind: ReindexKind,
  offset: number,
  batchSize: number,
): Promise<ReindexBatchResult> {
  type Row = { id: string };
  let rows: Row[] = [];

  switch (kind) {
    case 'channel': {
      const r = await db
        .select({ id: Channel.id })
        .from(Channel)
        .orderBy(asc(Channel.id))
        .limit(batchSize)
        .offset(offset);
      rows = r.map((x) => ({ id: x.id }));
      break;
    }
    case 'organization': {
      const r = await db
        .select({ id: Organization.id })
        .from(Organization)
        .orderBy(asc(Organization.id))
        .limit(batchSize)
        .offset(offset);
      rows = r.map((x) => ({ id: x.id }));
      break;
    }
    case 'media': {
      const r = await db
        .select({ id: UploadRecord.id })
        .from(UploadRecord)
        .where(isNotNull(UploadRecord.summaryEmbedding))
        .orderBy(asc(UploadRecord.id))
        .limit(batchSize)
        .offset(offset);
      rows = r.map((x) => ({ id: x.id }));
      break;
    }
    case 'speaker': {
      // Distinct uploads that have at least one speaker attribution.
      const r = await db
        .selectDistinct({ id: SpeakerAttribution.uploadRecordId })
        .from(SpeakerAttribution)
        .orderBy(asc(SpeakerAttribution.uploadRecordId))
        .limit(batchSize)
        .offset(offset);
      rows = r.map((x) => ({ id: x.id }));
      break;
    }
  }

  let indexed = 0;
  for (const { id } of rows) {
    try {
      if (kind === 'speaker') {
        await syncSpeakerVectors(id);
      } else {
        // `kind` is narrowed to a DocumentKind here ('speaker' handled above).
        await indexDocument(kind, id);
      }
      indexed++;
    } catch (err) {
      moduleLogger.error(
        `Failed to index document ${id} (${kind}), skipping: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    heartbeat({ indexed, total: rows.length });
  }

  moduleLogger.info(
    `Reindex batch complete: kind=${kind} offset=${offset} indexed=${indexed}`,
  );

  return { indexed, hasMore: rows.length === batchSize };
}
