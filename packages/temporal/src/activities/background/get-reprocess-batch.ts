import {
  AppUser,
  Channel,
  db,
  TranscriptParagraph,
  UploadRecord,
} from '@letschurch/db';
import {
  and,
  count,
  desc,
  eq,
  gt,
  isNotNull,
  lt,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
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

// `no_paragraphs` orders newest-first per product requirement (recent
// content catches up first); the other scopes keep the legacy asc-by-
// createdAt order. Returned as a tuple of `(direction, cursorPredicate)`
// so the caller can pass them into orderBy + where uniformly.
function isReverseOrdered(scope: ReprocessScope): boolean {
  return scope.kind === 'no_paragraphs';
}

function buildCursorPredicate(scope: ReprocessScope, cursor: string | null) {
  const parsed = parseCursor(cursor);
  if (!parsed) return undefined;
  const cmp = isReverseOrdered(scope) ? lt : gt;
  return or(
    cmp(UploadRecord.createdAt, new Date(parsed.createdAt)),
    and(
      eq(UploadRecord.createdAt, new Date(parsed.createdAt)),
      cmp(UploadRecord.id, parsed.id),
    ),
  );
}

function buildWhere(scope: ReprocessScope, cursor: string | null = null) {
  const finished = isNotNull(UploadRecord.transcodingFinishedAt);
  const afterCursor = buildCursorPredicate(scope, cursor);
  if (scope.kind === 'no_paragraphs') {
    // Subquery flavor (NOT EXISTS) rather than LEFT JOIN ... IS NULL
    // because the upload count grows and most uploads have many
    // paragraphs; the planner stops on the first row it finds and
    // skips. Equivalent SQL semantically; faster at scale.
    return and(
      finished,
      notExists(
        db
          .select({ one: sql<number>`1` })
          .from(TranscriptParagraph)
          .where(eq(TranscriptParagraph.uploadRecordId, UploadRecord.id)),
      ),
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
  const orderBy = isReverseOrdered(scope)
    ? [desc(UploadRecord.createdAt), desc(UploadRecord.id)]
    : [UploadRecord.createdAt, UploadRecord.id];

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
    .orderBy(...orderBy)
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

export async function getNoParagraphsUploadCount(): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(UploadRecord)
    .where(buildWhere({ kind: 'no_paragraphs' }));
  return result?.count ?? 0;
}
