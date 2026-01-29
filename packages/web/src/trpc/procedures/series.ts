import { prisma } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
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
      const series = await prisma.uploadList.findUnique({
        select: {
          id: true,
          title: true,
          type: true,
          channel: {
            select: {
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
          },
        },
        where: {
          id: seriesId,
        },
      });

      if (!series || series.type !== 'SERIES') {
        moduleLogger.warn({ context: { seriesId } }, 'Series not found');
        throw new Error('Series not found');
      }

      if (!series.channel) {
        moduleLogger.warn({ context: { seriesId } }, 'Series has no channel');
        throw new Error('Series not found');
      }

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

      // Fetch all series entries
      const entries = await prisma.uploadListEntry.findMany({
        select: {
          upload: {
            select: {
              id: true,
              title: true,
              publishedAt: true,
              lengthSeconds: true,
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
              channel: {
                select: {
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
        where: {
          uploadListId: seriesId,
          upload: {
            visibility: 'PUBLIC',
            transcodingFinishedAt: { not: null },
            deletedAt: null,
          },
        },
        orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
      });

      const items = entries.map((entry) => {
        const upload = entry.upload;
        const {
          defaultThumbnailPath,
          overrideThumbnailPath,
          channel,
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

      const series = await prisma.uploadList.findUnique({
        select: {
          id: true,
          title: true,
          type: true,
          createdAt: true,
          updatedAt: true,
          author: {
            select: {
              id: true,
              username: true,
              avatarPath: true,
            },
          },
          channel: {
            select: {
              id: true,
              name: true,
              slug: true,
              avatarPath: true,
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
          },
          _count: {
            select: {
              uploads: {
                where: {
                  upload: {
                    visibility: 'PUBLIC',
                    transcodingFinishedAt: { not: null },
                    transcribingFinishedAt: { not: null },
                    deletedAt: null,
                  },
                },
              },
            },
          },
        },
        where: {
          id: seriesId,
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

      // Check if channel exists and is public/approved
      if (!series.channel) {
        moduleLogger.warn({ context: { seriesId } }, 'Series has no channel');
        throw new Error('Series not found');
      }

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

      const authorAvatarUrl = series.author.avatarPath
        ? getPublicImageUrl(
            publicS3.getS3ProtocolUri(series.author.avatarPath),
            {
              resize: appAvatarMd2x,
            },
          )
        : null;

      const channelAvatarUrl = series.channel.avatarPath
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
        channel: {
          id: OutgoingIdSchema.parse(series.channel.id),
          name: series.channel.name,
          slug: series.channel.slug,
          avatarUrl: channelAvatarUrl,
        },
        mediaCount: series._count.uploads,
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

      // Get first media item thumbnail for SEO
      const firstMedia = await prisma.uploadListEntry.findFirst({
        where: {
          uploadListId: seriesId,
          upload: {
            visibility: 'PUBLIC',
            transcodingFinishedAt: { not: null },
            deletedAt: null,
          },
        },
        select: {
          upload: {
            select: {
              overrideThumbnailPath: true,
              defaultThumbnailPath: true,
              channel: {
                select: {
                  defaultThumbnailPath: true,
                },
              },
            },
          },
        },
        orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
      });

      if (!firstMedia) {
        return null;
      }

      return resolveThumbnailUrl({
        overrideThumbnailPath: firstMedia.upload.overrideThumbnailPath,
        defaultThumbnailPath: firstMedia.upload.defaultThumbnailPath,
        channelDefaultThumbnailPath:
          firstMedia.upload.channel.defaultThumbnailPath,
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
      const series = await prisma.uploadList.findUnique({
        select: {
          id: true,
          type: true,
          channel: {
            select: {
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
          },
        },
        where: {
          id: seriesId,
        },
      });

      if (!series || series.type !== 'SERIES') {
        moduleLogger.warn({ context: { seriesId } }, 'Series not found');
        throw new Error('Series not found');
      }

      if (!series.channel) {
        moduleLogger.warn({ context: { seriesId } }, 'Series has no channel');
        throw new Error('Series not found');
      }

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

      // Fetch series entries with uploads
      const entries = await prisma.uploadListEntry.findMany({
        select: {
          createdAt: true,
          rank: true,
          upload: {
            select: {
              id: true,
              title: true,
              description: true,
              publishedAt: true,
              lengthSeconds: true,
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
              channel: {
                select: {
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
        where: {
          uploadListId: seriesId,
          upload: {
            visibility: 'PUBLIC',
            transcodingFinishedAt: { not: null },
            deletedAt: null,
          },
          ...(cursor
            ? {
                createdAt: {
                  gt: new Date(cursor),
                },
              }
            : {}),
        },
        orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
        take: limit + 1, // Fetch one extra to determine if there are more
      });

      const hasMore = entries.length > limit;
      const items = hasMore ? entries.slice(0, limit) : entries;
      const nextCursor = hasMore
        ? (items[items.length - 1].createdAt.toISOString() ?? null)
        : null;

      const uploadsWithThumbnails = items.map((entry) => {
        const upload = entry.upload;
        const {
          defaultThumbnailPath,
          overrideThumbnailPath,
          channel,
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
