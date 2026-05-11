import { AppUser, Channel, db, UploadRecord } from '@letschurch/db';
import { and, count, eq, gt, isNotNull, lt, or } from 'drizzle-orm';
import { CURRENT_PIPELINE_VERSION } from '../../queues';
import type { ReprocessScope } from '../../reprocess-scope';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'activities/background/get-reprocess-batch',
});

export type ReprocessBatchItem = {
  id: string;
  channelId: string;
  channelSlug: string;
  appUserId: string;
  username: string;
};

export type ReprocessBatch = {
  items: ReprocessBatchItem[];
  nextCursor: string | null;
};

type BatchCursor = { createdAt: string; id: string };

function parseCursor(cursor: string | null): BatchCursor | null {
  if (!cursor) return null;
  return JSON.parse(cursor) as BatchCursor;
}

function buildWhere(scope: ReprocessScope, cursor: string | null = null) {
  const parsed = parseCursor(cursor);
  const finished = isNotNull(UploadRecord.transcodingFinishedAt);
  const afterCursor = parsed
    ? or(
        gt(UploadRecord.createdAt, new Date(parsed.createdAt)),
        and(
          eq(UploadRecord.createdAt, new Date(parsed.createdAt)),
          gt(UploadRecord.id, parsed.id),
        ),
      )
    : undefined;
  if (scope.kind === 'legacy') {
    return and(
      lt(UploadRecord.pipelineVersion, CURRENT_PIPELINE_VERSION),
      finished,
      afterCursor,
    );
  }
  if (scope.kind === 'channel') {
    return and(
      eq(UploadRecord.channelId, scope.channelId),
      finished,
      afterCursor,
    );
  }
  return and(finished, afterCursor);
}

export async function getReprocessBatch(
  scope: ReprocessScope,
  batchSize = 100,
  cursor: string | null = null,
): Promise<ReprocessBatch> {
  moduleLogger.info(
    `Fetching reprocess batch: kind=${scope.kind} batchSize=${batchSize} cursor=${cursor}`,
  );

  const where = buildWhere(scope, cursor);

  const rows = await db
    .select({
      id: UploadRecord.id,
      channelId: UploadRecord.channelId,
      channelSlug: Channel.slug,
      appUserId: UploadRecord.appUserId,
      username: AppUser.username,
      createdAt: UploadRecord.createdAt,
    })
    .from(UploadRecord)
    .innerJoin(Channel, eq(UploadRecord.channelId, Channel.id))
    .innerJoin(AppUser, eq(UploadRecord.appUserId, AppUser.id))
    .where(where)
    .orderBy(UploadRecord.createdAt, UploadRecord.id)
    .limit(batchSize + 1);

  const hasMore = rows.length > batchSize;
  const slicedRows = hasMore ? rows.slice(0, batchSize) : rows;
  const lastRow = slicedRows.at(-1);
  const nextCursor =
    hasMore && lastRow
      ? JSON.stringify({
          createdAt: lastRow.createdAt.toISOString(),
          id: lastRow.id,
        })
      : null;
  const items = slicedRows.map(({ createdAt: _c, ...rest }) => rest);

  moduleLogger.info(
    `Reprocess batch fetched: found=${items.length} hasMore=${hasMore}`,
  );

  return { items, nextCursor };
}

export async function getLegacyUploadCount(): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(UploadRecord)
    .where(buildWhere({ kind: 'legacy' }));
  return result?.count ?? 0;
}
