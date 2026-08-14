import { Channel, db, UploadListEntry, UploadRecord } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { TRPCError } from '@trpc/server';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarXs2x } from '@/util/avatar-sizes';
import { getListUploadVisibilities } from '@/util/list-visibility-rules';
import logger from '@/util/logger';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';

import { publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/list',
});

export const LIST_CONTEXT_PAGE_LIMIT = 20;
const MAX_LIST_CONTEXT_PAGE_LIMIT = 50;

const listContextQuerySchema = z.object({
  listId: IncomingIdSchema,
  currentMediaId: IncomingIdSchema.optional(),
  cursor: z.string().max(1024).optional(),
  limit: z
    .number()
    .int()
    .min(2)
    .max(MAX_LIST_CONTEXT_PAGE_LIMIT)
    .default(LIST_CONTEXT_PAGE_LIMIT),
});

const cursorPayloadSchema = z
  .object({
    version: z.literal(1),
    listId: z.uuid(),
    direction: z.enum(['before', 'after']),
    rank: z.number().int().nullable(),
    createdAt: z.iso.datetime(),
    uploadRecordId: z.uuid(),
  })
  .strict();

type CursorPayload = z.infer<typeof cursorPayloadSchema>;

function encodeCursor(
  listId: string,
  direction: CursorPayload['direction'],
  row: {
    rank: number | null;
    createdAt: Date;
    uploadRecordId: string;
  },
) {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      listId,
      direction,
      rank: row.rank,
      createdAt: row.createdAt.toISOString(),
      uploadRecordId: row.uploadRecordId,
    } satisfies CursorPayload),
  ).toString('base64url');
}

function decodeCursor(cursor: string, listId: string): CursorPayload {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid list context cursor',
    });
  }

  const parsed = cursorPayloadSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.listId !== listId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid list context cursor',
    });
  }
  return parsed.data;
}

function tupleAfter(
  columns: {
    rank: AnyPgColumn;
    createdAt: AnyPgColumn;
    uploadRecordId: AnyPgColumn;
  },
  cursor: CursorPayload,
) {
  const createdAt = new Date(cursor.createdAt);
  const afterWithinRank = or(
    gt(columns.createdAt, createdAt),
    and(
      eq(columns.createdAt, createdAt),
      gt(columns.uploadRecordId, cursor.uploadRecordId),
    ),
  );

  return cursor.rank === null
    ? and(isNull(columns.rank), afterWithinRank)
    : or(
        gt(columns.rank, cursor.rank),
        and(eq(columns.rank, cursor.rank), afterWithinRank),
        isNull(columns.rank),
      );
}

function tupleBefore(
  columns: {
    rank: AnyPgColumn;
    createdAt: AnyPgColumn;
    uploadRecordId: AnyPgColumn;
  },
  cursor: CursorPayload,
) {
  const createdAt = new Date(cursor.createdAt);
  const beforeWithinRank = or(
    lt(columns.createdAt, createdAt),
    and(
      eq(columns.createdAt, createdAt),
      lt(columns.uploadRecordId, cursor.uploadRecordId),
    ),
  );

  return cursor.rank === null
    ? or(isNotNull(columns.rank), and(isNull(columns.rank), beforeWithinRank))
    : or(
        lt(columns.rank, cursor.rank),
        and(eq(columns.rank, cursor.rank), beforeWithinRank),
      );
}

type HydratedRow = {
  rank: number | null;
  entryCreatedAt: Date;
  position: number;
  total: number;
  id: string;
  title: string | null;
  publishedAt: Date;
  lengthSeconds: number | null;
  defaultThumbnailPath: string | null;
  overrideThumbnailPath: string | null;
  channelId: string;
  channelName: string;
  channelSlug: string;
  channelAvatarPath: string | null;
  channelDefaultThumbnailPath: string | null;
};

function hydrateItem(row: HydratedRow) {
  const thumbnailUrl = resolveThumbnailUrl({
    overrideThumbnailPath: row.overrideThumbnailPath,
    defaultThumbnailPath: row.defaultThumbnailPath,
    channelDefaultThumbnailPath: row.channelDefaultThumbnailPath,
    size: 'card',
  });
  const channelAvatarUrl = row.channelAvatarPath
    ? getPublicImageUrl(publicS3.getS3ProtocolUri(row.channelAvatarPath), {
        resize: appAvatarXs2x,
      })
    : null;

  return {
    id: OutgoingIdSchema.parse(row.id),
    title: row.title,
    publishedAt: row.publishedAt,
    lengthSeconds: row.lengthSeconds,
    thumbnailUrl,
    channel: {
      id: OutgoingIdSchema.parse(row.channelId),
      name: row.channelName,
      slug: row.channelSlug,
      avatarUrl: channelAvatarUrl,
    },
  };
}

export const listProcedures = {
  getListContext: publicProcedure
    .input(listContextQuerySchema)
    .query(async ({ input }) => {
      const { listId, currentMediaId, limit } = input;
      const cursor = input.cursor
        ? decodeCursor(input.cursor, listId)
        : undefined;

      moduleLogger.info(
        { context: { listId, hasCursor: Boolean(cursor) } },
        'Fetching list context',
      );

      const list = await db.query.UploadList.findFirst({
        where: (t, { eq: equals }) => equals(t.id, listId),
        columns: {
          id: true,
          title: true,
          type: true,
          visibility: true,
        },
        with: {
          channel: {
            columns: {
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
          },
        },
      });

      if (
        !list ||
        (list.type !== 'PLAYLIST' && list.type !== 'SERIES') ||
        !list.channel ||
        list.channel.visibility === 'PRIVATE' ||
        !list.channel.approvedAt ||
        list.channel.deletedAt
      ) {
        moduleLogger.warn(
          { context: { listId } },
          'List context is not accessible',
        );
        return null;
      }

      const visibleEntries = db.$with('visible_list_entries').as(
        db
          .select({
            rank: UploadListEntry.rank,
            createdAt: UploadListEntry.createdAt,
            uploadRecordId: UploadListEntry.uploadRecordId,
            position:
              sql<number>`row_number() over (order by ${UploadListEntry.rank} asc, ${UploadListEntry.createdAt} asc, ${UploadListEntry.uploadRecordId} asc)`
                .mapWith(Number)
                .as('position'),
            total: sql<number>`count(*) over ()`
              .mapWith(Number)
              .as('total_count'),
          })
          .from(UploadListEntry)
          .innerJoin(
            UploadRecord,
            eq(UploadRecord.id, UploadListEntry.uploadRecordId),
          )
          .where(
            and(
              eq(UploadListEntry.uploadListId, listId),
              inArray(
                UploadRecord.visibility,
                getListUploadVisibilities(list.visibility),
              ),
              isNotNull(UploadRecord.transcodingFinishedAt),
              isNull(UploadRecord.deletedAt),
            ),
          ),
      );

      const selectedQuery = db.select().from(visibleEntries);
      const selectedEntries = db.$with('selected_list_entries').as(
        cursor
          ? selectedQuery
              .where(
                cursor.direction === 'after'
                  ? tupleAfter(visibleEntries, cursor)
                  : tupleBefore(visibleEntries, cursor),
              )
              .orderBy(
                cursor.direction === 'after'
                  ? asc(visibleEntries.rank)
                  : desc(visibleEntries.rank),
                cursor.direction === 'after'
                  ? asc(visibleEntries.createdAt)
                  : desc(visibleEntries.createdAt),
                cursor.direction === 'after'
                  ? asc(visibleEntries.uploadRecordId)
                  : desc(visibleEntries.uploadRecordId),
              )
              .limit(limit)
          : selectedQuery
              .where(
                sql`${visibleEntries.position} >= greatest(
                  least(
                    coalesce(
                      (select ${visibleEntries.position}
                       from ${visibleEntries}
                       where ${visibleEntries.uploadRecordId} = ${currentMediaId ?? null}),
                      1
                    ) - ${Math.floor((limit - 1) / 2)},
                    greatest(
                      coalesce((select max(${visibleEntries.total}) from ${visibleEntries}), 0)
                        - ${limit} + 1,
                      1
                    )
                  ),
                  1
                )`,
              )
              .orderBy(
                asc(visibleEntries.rank),
                asc(visibleEntries.createdAt),
                asc(visibleEntries.uploadRecordId),
              )
              .limit(limit),
      );

      const rows = (await db
        .with(visibleEntries, selectedEntries)
        .select({
          rank: selectedEntries.rank,
          entryCreatedAt: selectedEntries.createdAt,
          position: selectedEntries.position,
          total: selectedEntries.total,
          id: UploadRecord.id,
          title: UploadRecord.title,
          publishedAt: UploadRecord.publishedAt,
          lengthSeconds: UploadRecord.lengthSeconds,
          defaultThumbnailPath: UploadRecord.defaultThumbnailPath,
          overrideThumbnailPath: UploadRecord.overrideThumbnailPath,
          channelId: Channel.id,
          channelName: Channel.name,
          channelSlug: Channel.slug,
          channelAvatarPath: Channel.avatarPath,
          channelDefaultThumbnailPath: Channel.defaultThumbnailPath,
        })
        .from(selectedEntries)
        .innerJoin(
          UploadRecord,
          eq(UploadRecord.id, selectedEntries.uploadRecordId),
        )
        .innerJoin(Channel, eq(Channel.id, UploadRecord.channelId))
        .orderBy(
          asc(selectedEntries.rank),
          asc(selectedEntries.createdAt),
          asc(selectedEntries.uploadRecordId),
        )) as HydratedRow[];

      const items = rows.map(hydrateItem);
      const currentRow = currentMediaId
        ? rows.find((row) => row.id === currentMediaId)
        : undefined;
      const currentItemIndex = currentRow
        ? rows.findIndex((row) => row.id === currentRow.id)
        : -1;
      const nextItem =
        currentItemIndex >= 0 ? (items[currentItemIndex + 1] ?? null) : null;
      const firstRow = rows[0];
      const lastRow = rows.at(-1);
      const total = firstRow?.total ?? 0;

      return {
        title: list.title,
        type: list.type,
        items,
        currentPosition: currentRow?.position ?? null,
        total,
        nextItem,
        previousCursor:
          firstRow && firstRow.position > 1
            ? encodeCursor(listId, 'before', {
                rank: firstRow.rank,
                createdAt: firstRow.entryCreatedAt,
                uploadRecordId: firstRow.id,
              })
            : null,
        nextCursor:
          lastRow && lastRow.position < lastRow.total
            ? encodeCursor(listId, 'after', {
                rank: lastRow.rank,
                createdAt: lastRow.entryCreatedAt,
                uploadRecordId: lastRow.id,
              })
            : null,
      };
    }),
};
