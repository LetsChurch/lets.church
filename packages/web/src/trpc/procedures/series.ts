import { Channel, db, UploadListEntry, UploadRecord } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import {
  and,
  asc,
  count,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
} from 'drizzle-orm';
import { z } from 'zod';

import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarMd2x, appAvatarXs2x } from '@/util/avatar-sizes';
import {
  encodeListMediaCursor,
  listMediaCursorSchema,
} from '@/util/list-pagination';
import {
  canShowUploadInList,
  getListUploadVisibilities,
} from '@/util/list-visibility-rules';
import logger from '@/util/logger';
import { isChannelRoutable } from '@/util/media-visibility';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';

import { publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/series',
});

const seriesQuerySchema = z.object({
  seriesId: IncomingIdSchema,
});

const seriesMediaQuerySchema = z.object({
  seriesId: IncomingIdSchema,
  limit: z.number().min(1).max(50).default(20),
  cursor: listMediaCursorSchema.nullable().optional(),
});

export const seriesProcedures = {
  getAllSeriesItems: publicProcedure
    .input(seriesQuerySchema)
    .query(async ({ input }) => {
      const { seriesId } = input;

      moduleLogger.info({ context: { seriesId } }, 'Fetching all series items');

      // First verify the series and its channel are directly routable.
      const series = await db.query.UploadList.findFirst({
        where: (t, { eq }) => eq(t.id, seriesId),
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

      if (!series || series.type !== 'SERIES') {
        moduleLogger.warn({ context: { seriesId } }, 'Series not found');
        throw new Error('Series not found');
      }

      if (series.channel) {
        if (!isChannelRoutable(series.channel)) {
          moduleLogger.warn(
            {
              context: {
                seriesId,
                channelVisibility: series.channel.visibility,
                channelApproved: Boolean(series.channel.approvedAt),
                channelDeleted: Boolean(series.channel.deletedAt),
              },
            },
            'Channel not accessible',
          );
          throw new Error('Series not found');
        }
      }

      // Fetch all series entries
      const entries = await db.query.UploadListEntry.findMany({
        where: (t, { eq }) => eq(t.uploadListId, seriesId),
        columns: {},
        with: {
          upload: {
            columns: {
              id: true,
              title: true,
              publishedAt: true,
              lengthSeconds: true,
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
              visibility: true,
              transcodingFinishedAt: true,
              deletedAt: true,
            },
            with: {
              channel: {
                columns: {
                  id: true,
                  name: true,
                  slug: true,
                  avatarPath: true,
                  defaultThumbnailPath: true,
                },
              },
            },
          },
        },
        orderBy: (t, { asc }) => [asc(t.rank), asc(t.createdAt)],
      });

      // UNLISTED series can reveal UNLISTED uploads to direct-link viewers.
      const filteredEntries = entries.filter(
        (e) =>
          canShowUploadInList(series.visibility, e.upload.visibility) &&
          e.upload.transcodingFinishedAt !== null &&
          e.upload.deletedAt === null,
      );

      const items = filteredEntries.map((entry) => {
        const upload = entry.upload;
        const {
          defaultThumbnailPath,
          overrideThumbnailPath,
          channel,
          visibility: _visibility,
          transcodingFinishedAt: _transcodingFinishedAt,
          deletedAt: _deletedAt,
          ...uploadRest
        } = upload;

        const thumbnailUrl = resolveThumbnailUrl({
          overrideThumbnailPath,
          defaultThumbnailPath,
          channelDefaultThumbnailPath: channel.defaultThumbnailPath,
          size: 'card',
        });

        const channelAvatarUrl = channel.avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
              resize: appAvatarXs2x,
            })
          : null;

        return {
          ...uploadRest,
          id: OutgoingIdSchema.parse(uploadRest.id),
          thumbnailUrl,
          channel: {
            id: OutgoingIdSchema.parse(channel.id),
            name: channel.name,
            slug: channel.slug,
            avatarUrl: channelAvatarUrl,
          },
        };
      });

      return {
        title: series.title,
        items,
      };
    }),

  getPublicSeries: publicProcedure
    .input(seriesQuerySchema)
    .query(async ({ input }) => {
      const { seriesId } = input;

      moduleLogger.info({ context: { seriesId } }, 'Fetching public series');

      const series = await db.query.UploadList.findFirst({
        where: (t, { eq }) => eq(t.id, seriesId),
        columns: {
          id: true,
          title: true,
          type: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
        },
        with: {
          author: {
            columns: {
              id: true,
              username: true,
              avatarPath: true,
            },
          },
          channel: {
            columns: {
              id: true,
              name: true,
              slug: true,
              avatarPath: true,
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
          },
        },
      });

      if (!series) {
        moduleLogger.warn({ context: { seriesId } }, 'Series not found');
        throw new Error('Series not found');
      }

      if (series.type !== 'SERIES') {
        moduleLogger.warn(
          { context: { seriesId, type: series.type } },
          'Not a series',
        );
        throw new Error('Series not found');
      }

      // UNLISTED channels remain reachable by direct link, matching media.
      if (series.channel) {
        if (!isChannelRoutable(series.channel)) {
          moduleLogger.warn(
            {
              context: {
                seriesId,
                channelVisibility: series.channel.visibility,
                channelApproved: Boolean(series.channel.approvedAt),
                channelDeleted: Boolean(series.channel.deletedAt),
              },
            },
            'Channel not accessible',
          );
          throw new Error('Series not found');
        }
      }

      const mediaCountResult = await db
        .select({ count: count() })
        .from(UploadListEntry)
        .innerJoin(
          UploadRecord,
          eq(UploadListEntry.uploadRecordId, UploadRecord.id),
        )
        .where(
          and(
            eq(UploadListEntry.uploadListId, seriesId),
            inArray(
              UploadRecord.visibility,
              getListUploadVisibilities(series.visibility),
            ),
            isNotNull(UploadRecord.transcodingFinishedAt),
            isNull(UploadRecord.deletedAt),
          ),
        )
        .then((r) => r[0]);

      const mediaCount = Number(mediaCountResult?.count ?? 0);

      const authorAvatarUrl = series.author.avatarPath
        ? getPublicImageUrl(
            publicS3.getS3ProtocolUri(series.author.avatarPath),
            {
              resize: appAvatarMd2x,
            },
          )
        : null;

      const channelAvatarUrl = series.channel?.avatarPath
        ? getPublicImageUrl(
            publicS3.getS3ProtocolUri(series.channel.avatarPath),
            {
              resize: appAvatarXs2x,
            },
          )
        : null;

      return {
        id: OutgoingIdSchema.parse(series.id),
        title: series.title,
        type: series.type,
        visibility: series.visibility,
        createdAt: series.createdAt,
        updatedAt: series.updatedAt,
        author: {
          id: OutgoingIdSchema.parse(series.author.id),
          username: series.author.username,
          avatarUrl: authorAvatarUrl,
        },
        channel: series.channel
          ? {
              id: OutgoingIdSchema.parse(series.channel.id),
              name: series.channel.name,
              slug: series.channel.slug,
              avatarUrl: channelAvatarUrl,
            }
          : null,
        mediaCount,
      };
    }),

  getPublicSeriesFirstThumbnail: publicProcedure
    .input(seriesQuerySchema)
    .query(async ({ input }) => {
      const { seriesId } = input;

      moduleLogger.info(
        { context: { seriesId } },
        'Fetching first series thumbnail',
      );

      // Apply the same visibility checks as getPublicSeries before resolving a
      // thumbnail, so a private/unapproved channel's series id can't leak a
      // thumbnail URL through this endpoint.
      const series = await db.query.UploadList.findFirst({
        where: (t, { eq }) => eq(t.id, seriesId),
        columns: { id: true, type: true, visibility: true },
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

      if (!series || series.type !== 'SERIES') {
        return null;
      }

      if (series.channel && !isChannelRoutable(series.channel)) {
        return null;
      }

      const firstEntry = await db
        .select({
          overrideThumbnailPath: UploadRecord.overrideThumbnailPath,
          defaultThumbnailPath: UploadRecord.defaultThumbnailPath,
          channelDefaultThumbnailPath: Channel.defaultThumbnailPath,
        })
        .from(UploadListEntry)
        .innerJoin(
          UploadRecord,
          eq(UploadListEntry.uploadRecordId, UploadRecord.id),
        )
        .leftJoin(Channel, eq(UploadRecord.channelId, Channel.id))
        .where(
          and(
            eq(UploadListEntry.uploadListId, seriesId),
            inArray(
              UploadRecord.visibility,
              getListUploadVisibilities(series.visibility),
            ),
            isNotNull(UploadRecord.transcodingFinishedAt),
            isNull(UploadRecord.deletedAt),
          ),
        )
        .orderBy(asc(UploadListEntry.rank), asc(UploadListEntry.createdAt))
        .limit(1)
        .then((r) => r[0]);

      if (!firstEntry) {
        return null;
      }

      return resolveThumbnailUrl({
        overrideThumbnailPath: firstEntry.overrideThumbnailPath,
        defaultThumbnailPath: firstEntry.defaultThumbnailPath,
        channelDefaultThumbnailPath: firstEntry.channelDefaultThumbnailPath,
        size: 'featured',
      });
    }),

  getPublicSeriesMedia: publicProcedure
    .input(seriesMediaQuerySchema)
    .query(async ({ input }) => {
      const { seriesId, limit, cursor } = input;

      moduleLogger.info(
        { context: { seriesId, limit, cursor } },
        'Fetching public series media',
      );

      // First verify the series and its channel are directly routable.
      const series = await db.query.UploadList.findFirst({
        where: (t, { eq }) => eq(t.id, seriesId),
        columns: {
          id: true,
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

      if (!series || series.type !== 'SERIES') {
        moduleLogger.warn({ context: { seriesId } }, 'Series not found');
        throw new Error('Series not found');
      }

      if (series.channel) {
        if (!isChannelRoutable(series.channel)) {
          moduleLogger.warn(
            {
              context: {
                seriesId,
                channelVisibility: series.channel.visibility,
                channelApproved: Boolean(series.channel.approvedAt),
                channelDeleted: Boolean(series.channel.deletedAt),
              },
            },
            'Channel not accessible',
          );
          throw new Error('Series not found');
        }
      }

      // Filter before pagination so hidden entries cannot consume the page
      // limit and make later visible uploads unreachable.
      const entries = await db.query.UploadListEntry.findMany({
        where: (t, operators) => {
          const afterCursor = cursor
            ? cursor.rank === null
              ? operators.and(
                  operators.isNull(t.rank),
                  operators.or(
                    operators.gt(t.createdAt, cursor.createdAt),
                    operators.and(
                      operators.eq(t.createdAt, cursor.createdAt),
                      operators.gt(t.uploadRecordId, cursor.uploadRecordId),
                    ),
                  ),
                )
              : operators.or(
                  operators.gt(t.rank, cursor.rank),
                  operators.isNull(t.rank),
                  operators.and(
                    operators.eq(t.rank, cursor.rank),
                    operators.or(
                      operators.gt(t.createdAt, cursor.createdAt),
                      operators.and(
                        operators.eq(t.createdAt, cursor.createdAt),
                        operators.gt(t.uploadRecordId, cursor.uploadRecordId),
                      ),
                    ),
                  ),
                )
            : undefined;

          return operators.and(
            operators.eq(t.uploadListId, seriesId),
            afterCursor,
            exists(
              db
                .select({ id: UploadRecord.id })
                .from(UploadRecord)
                .where(
                  and(
                    eq(UploadRecord.id, t.uploadRecordId),
                    inArray(
                      UploadRecord.visibility,
                      getListUploadVisibilities(series.visibility),
                    ),
                    isNotNull(UploadRecord.transcodingFinishedAt),
                    isNull(UploadRecord.deletedAt),
                  ),
                ),
            ),
          );
        },
        columns: {
          createdAt: true,
          rank: true,
          uploadRecordId: true,
        },
        with: {
          upload: {
            columns: {
              id: true,
              title: true,
              description: true,
              publishedAt: true,
              lengthSeconds: true,
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
              visibility: true,
              transcodingFinishedAt: true,
              deletedAt: true,
            },
            with: {
              channel: {
                columns: {
                  id: true,
                  name: true,
                  slug: true,
                  avatarPath: true,
                  defaultThumbnailPath: true,
                },
              },
            },
          },
        },
        orderBy: (t, { asc }) => [
          asc(t.rank),
          asc(t.createdAt),
          asc(t.uploadRecordId),
        ],
        limit: limit + 1, // Fetch one extra to determine if there are more
      });

      const hasMore = entries.length > limit;
      const items = hasMore ? entries.slice(0, limit) : entries;
      const lastItem = items.at(-1);
      const nextCursor =
        hasMore && lastItem
          ? encodeListMediaCursor({
              rank: lastItem.rank,
              createdAt: lastItem.createdAt,
              uploadRecordId: lastItem.uploadRecordId,
            })
          : null;

      const uploadsWithThumbnails = items.map((entry) => {
        const upload = entry.upload;
        const {
          defaultThumbnailPath,
          overrideThumbnailPath,
          channel,
          visibility: _visibility,
          transcodingFinishedAt: _transcodingFinishedAt,
          deletedAt: _deletedAt,
          ...uploadRest
        } = upload;

        const thumbnailUrl = resolveThumbnailUrl({
          overrideThumbnailPath,
          defaultThumbnailPath,
          channelDefaultThumbnailPath: channel.defaultThumbnailPath,
          size: 'card',
        });

        const channelAvatarUrl = channel.avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
              resize: appAvatarXs2x,
            })
          : null;

        return {
          ...uploadRest,
          id: OutgoingIdSchema.parse(uploadRest.id),
          thumbnailUrl,
          channel: {
            ...channel,
            id: OutgoingIdSchema.parse(channel.id),
            avatarUrl: channelAvatarUrl,
          },
        };
      });

      return {
        items: uploadsWithThumbnails,
        nextCursor,
      };
    }),
};
