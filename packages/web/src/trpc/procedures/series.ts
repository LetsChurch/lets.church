import { Channel, db, UploadListEntry, UploadRecord } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { and, asc, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarMd2x, appAvatarXs2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
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
  cursor: z.string().nullable().optional(), // ISO date string
});

export const seriesProcedures = {
  getAllSeriesItems: publicProcedure
    .input(seriesQuerySchema)
    .query(async ({ input }) => {
      const { seriesId } = input;

      moduleLogger.info({ context: { seriesId } }, 'Fetching all series items');

      // First verify series exists and channel is public
      const series = await db.query.UploadList.findFirst({
        where: (t, { eq }) => eq(t.id, seriesId),
        columns: {
          id: true,
          title: true,
          type: true,
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
        if (
          series.channel.visibility !== 'PUBLIC' ||
          !series.channel.approvedAt ||
          series.channel.deletedAt
        ) {
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

      // Filter to public, transcoded, non-deleted uploads
      const filteredEntries = entries.filter(
        (e) =>
          e.upload.visibility === 'PUBLIC' &&
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

      const [series, mediaCountResult] = await Promise.all([
        db.query.UploadList.findFirst({
          where: (t, { eq }) => eq(t.id, seriesId),
          columns: {
            id: true,
            title: true,
            type: true,
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
        }),
        db
          .select({ count: count() })
          .from(UploadListEntry)
          .innerJoin(
            UploadRecord,
            eq(UploadListEntry.uploadRecordId, UploadRecord.id),
          )
          .where(
            and(
              eq(UploadListEntry.uploadListId, seriesId),
              eq(UploadRecord.visibility, 'PUBLIC'),
              isNotNull(UploadRecord.transcodingFinishedAt),
              isNull(UploadRecord.deletedAt),
            ),
          )
          .then((r) => r[0]),
      ]);

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

      // Check if channel exists and is public/approved
      if (series.channel) {
        if (
          series.channel.visibility !== 'PUBLIC' ||
          !series.channel.approvedAt ||
          series.channel.deletedAt
        ) {
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

      const mediaCount = mediaCountResult?.count ?? 0;

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
            eq(UploadRecord.visibility, 'PUBLIC'),
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

      // First verify series exists and channel is public
      const series = await db.query.UploadList.findFirst({
        where: (t, { eq }) => eq(t.id, seriesId),
        columns: {
          id: true,
          type: true,
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
        if (
          series.channel.visibility !== 'PUBLIC' ||
          !series.channel.approvedAt ||
          series.channel.deletedAt
        ) {
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

      // Fetch series entries with uploads
      const entries = await db.query.UploadListEntry.findMany({
        where: (t, { eq, and, gt }) =>
          and(
            eq(t.uploadListId, seriesId),
            ...(cursor ? [gt(t.createdAt, new Date(cursor))] : []),
          ),
        columns: {
          createdAt: true,
          rank: true,
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
        orderBy: (t, { asc }) => [asc(t.rank), asc(t.createdAt)],
        limit: limit + 1, // Fetch one extra to determine if there are more
      });

      // Filter to public, transcoded, non-deleted uploads
      const filteredEntries = entries.filter(
        (e) =>
          e.upload.visibility === 'PUBLIC' &&
          e.upload.transcodingFinishedAt !== null &&
          e.upload.deletedAt === null,
      );

      const hasMore = filteredEntries.length > limit;
      const items = hasMore ? filteredEntries.slice(0, limit) : filteredEntries;
      const nextCursor = hasMore
        ? (items[items.length - 1].createdAt.toISOString() ?? null)
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
