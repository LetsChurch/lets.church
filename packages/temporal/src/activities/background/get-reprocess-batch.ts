import {
  AppUser,
  Channel,
  db,
  TranscriptParagraph,
  UploadRecord,
  UploadVariant,
} from '@letschurch/db';
import {
  and,
  arrayOverlaps,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  lt,
  lte,
  notExists,
  or,
  sql,
} from 'drizzle-orm';

import type { ReprocessScope } from '../../reprocess-scope';
import logger from '../../util/logger';

const moduleLogger = logger.child({
  module: 'activities/background/get-reprocess-batch',
});

export type ProcessingScope = 'transcode' | 'transcribe' | 'everything';

export type ReprocessBatchFilters = {
  // Needed to pick the date-range column and to gate the video-only
  // filter (only meaningful when the run includes a transcode).
  processingScope: ProcessingScope;
  // Inclusive ISO datetime bounds. The column they apply to depends on
  // `processingScope`: a full ('everything') run filters by creation
  // date, a transcode-only run by `transcodingFinishedAt`, and a
  // transcribe-only run by `transcribingFinishedAt`. Either bound may be
  // omitted for an open-ended range.
  dateStart?: string;
  dateEnd?: string;
  // When true (and the run transcodes), restrict to uploads that already
  // have at least one VIDEO_* variant — skips audio-only uploads.
  videoOnly?: boolean;
};

// Playback/download variants that represent a video rendition. Used by
// the `videoOnly` filter via array overlap against `UploadRecord.variants`.
const VIDEO_VARIANTS = UploadVariant.enumValues.filter((v) =>
  v.startsWith('VIDEO'),
);

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

// All scopes process newest-first (reverse creation order) so the most
// recent uploads catch up first. The cursor walks strictly "older than
// the last row" via `lt` to match the desc ordering in getReprocessBatch.
function buildCursorPredicate(cursor: string | null) {
  const parsed = parseCursor(cursor);
  if (!parsed) return undefined;
  return or(
    lt(UploadRecord.createdAt, new Date(parsed.createdAt)),
    and(
      eq(UploadRecord.createdAt, new Date(parsed.createdAt)),
      lt(UploadRecord.id, parsed.id),
    ),
  );
}

// Column the date-range filter applies to, selected by what the run does.
function dateRangeColumn(processingScope: ProcessingScope) {
  switch (processingScope) {
    case 'transcribe':
      return UploadRecord.transcribingFinishedAt;
    case 'transcode':
      return UploadRecord.transcodingFinishedAt;
    default:
      return UploadRecord.createdAt;
  }
}

// Optional date-range / video-only predicates. Returned as an array so
// callers can spread them into the scope's `and(...)`; `and` ignores
// undefined entries. `no_paragraphs` (the migration scope) never receives
// filters — the admin UI only exposes them on the channel and all-uploads
// flows.
function filterConditions(filters?: ReprocessBatchFilters) {
  if (!filters) return [];
  const { processingScope, dateStart, dateEnd, videoOnly } = filters;
  const conditions = [];
  if (dateStart) {
    conditions.push(gte(dateRangeColumn(processingScope), new Date(dateStart)));
  }
  if (dateEnd) {
    conditions.push(lte(dateRangeColumn(processingScope), new Date(dateEnd)));
  }
  if (
    videoOnly &&
    (processingScope === 'transcode' || processingScope === 'everything')
  ) {
    conditions.push(arrayOverlaps(UploadRecord.variants, VIDEO_VARIANTS));
  }
  return conditions;
}

function buildWhere(
  scope: ReprocessScope,
  cursor: string | null = null,
  filters?: ReprocessBatchFilters,
) {
  const finished = isNotNull(UploadRecord.transcodingFinishedAt);
  const afterCursor = buildCursorPredicate(cursor);
  const extra = filterConditions(filters);
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
      ...extra,
    );
  }
  if (scope.kind === 'channel') {
    return and(
      eq(UploadRecord.channelId, scope.channelId),
      finished,
      afterCursor,
      ...extra,
    );
  }
  return and(finished, afterCursor, ...extra);
}

export async function getReprocessBatch(
  scope: ReprocessScope,
  batchSize = 100,
  cursor: string | null = null,
  filters?: ReprocessBatchFilters,
): Promise<ReprocessBatch> {
  moduleLogger.info(
    `Fetching reprocess batch: kind=${scope.kind} batchSize=${batchSize} cursor=${cursor} filters=${JSON.stringify(filters ?? null)}`,
  );

  const where = buildWhere(scope, cursor, filters);
  // Newest-first across every scope (see buildCursorPredicate).
  const orderBy = [desc(UploadRecord.createdAt), desc(UploadRecord.id)];

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
