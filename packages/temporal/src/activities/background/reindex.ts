import { Channel, db, Organization, UploadRecord } from '@letschurch/db';
import { heartbeat } from '@temporalio/activity';
import { asc, isNotNull, sql } from 'drizzle-orm';
import logger from '../../util/logger';
import indexDocument from './index-document';

export type ReindexKind = 'upload' | 'transcript' | 'channel' | 'organization';

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
    case 'upload': {
      const r = await db.select({ count: countCol }).from(UploadRecord);
      return Number(r[0]?.count ?? 0);
    }
    case 'transcript': {
      const r = await db
        .select({ count: countCol })
        .from(UploadRecord)
        .where(isNotNull(UploadRecord.transcribingFinishedAt));
      return Number(r[0]?.count ?? 0);
    }
    case 'channel': {
      const r = await db.select({ count: countCol }).from(Channel);
      return Number(r[0]?.count ?? 0);
    }
    case 'organization': {
      const r = await db.select({ count: countCol }).from(Organization);
      return Number(r[0]?.count ?? 0);
    }
  }
}

export async function reindexBatch(
  kind: ReindexKind,
  offset: number,
  batchSize: number,
): Promise<ReindexBatchResult> {
  type Row = { id: string; s3Key?: string };
  let rows: Row[] = [];

  switch (kind) {
    case 'upload': {
      const r = await db
        .select({ id: UploadRecord.id })
        .from(UploadRecord)
        .orderBy(asc(UploadRecord.id))
        .limit(batchSize)
        .offset(offset);
      rows = r.map((x) => ({ id: x.id }));
      break;
    }
    case 'transcript': {
      const r = await db
        .select({ id: UploadRecord.id })
        .from(UploadRecord)
        .where(isNotNull(UploadRecord.transcribingFinishedAt))
        .orderBy(asc(UploadRecord.id))
        .limit(batchSize)
        .offset(offset);
      rows = r.map((x) => ({
        id: x.id,
        s3Key: `${x.id}/transcript.vtt`,
      }));
      break;
    }
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
  }

  let indexed = 0;
  for (const { id, s3Key } of rows) {
    try {
      await indexDocument(kind, id, s3Key);
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
