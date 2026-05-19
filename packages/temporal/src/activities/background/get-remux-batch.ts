import { AppUser, Channel, db, UploadRecord } from '@letschurch/db';
import { and, count, eq, gt, isNotNull, lt, or } from 'drizzle-orm';
import { CURRENT_PIPELINE_VERSION } from '../../queues';
import type { RemuxScope } from '../../remux-scope';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'activities/background/get-remux-batch',
});

export type RemuxBatchItem = {
  id: string;
  channelId: string;
  channelSlug: string;
  appUserId: string;
  username: string;
};

export type RemuxBatch = {
  items: RemuxBatchItem[];
  nextCursor: string | null;
};

type BatchCursor = { createdAt: string; id: string };

function parseCursor(cursor: string | null): BatchCursor | null {
  if (!cursor) return null;
  return JSON.parse(cursor) as BatchCursor;
}

function buildWhere(scope: RemuxScope, cursor: string | null = null) {
  const parsed = parseCursor(cursor);
  const legacy = lt(UploadRecord.pipelineVersion, CURRENT_PIPELINE_VERSION);
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
  if (scope.kind === 'channel') {
    return and(
      legacy,
      eq(UploadRecord.channelId, scope.channelId),
      finished,
      afterCursor,
    );
  }
  return and(legacy, finished, afterCursor);
}

export async function getRemuxBatch(
  scope: RemuxScope,
  batchSize = 100,
  cursor: string | null = null,
): Promise<RemuxBatch> {
  moduleLogger.info(
    `Fetching remux batch: kind=${scope.kind} batchSize=${batchSize} cursor=${cursor}`,
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
    `Remux batch fetched: found=${items.length} hasMore=${hasMore}`,
  );

  return { items, nextCursor };
}

export async function getLegacyRemuxCount(): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(UploadRecord)
    .where(buildWhere({ kind: 'legacy' }));
  return result?.count ?? 0;
}
