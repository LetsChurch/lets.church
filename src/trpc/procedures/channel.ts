import { z } from 'zod';
import { getThumbnailResize } from '@/schemas/common';
import db from '@/util/db';
import logger from '@/util/logger';
import { getS3ProtocolUri } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';
import { publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/channel',
});

const channelQuerySchema = z.object({
  slug: z.string(),
});

const channelMediaQuerySchema = z.object({
  slug: z.string(),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().nullable().optional(), // ISO date string
});

export const channelProcedures = {
  getChannelBySlug: publicProcedure
    .input(channelQuerySchema)
    .query(async ({ input, ctx }) => {
      const { slug } = input;
      const appUserId = ctx.session?.appUserId;

      moduleLogger.info('Fetching channel by slug', {
        slug,
        appUserId,
      });

      const channel = await db.channel.findUnique({
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          avatarPath: true,
          defaultThumbnailPath: true,
          visibility: true,
          approvedAt: true,
          _count: {
            select: {
              subscribers: true,
            },
          },
          uploadRecords: {
            select: {
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
            },
            where: {
              transcodingFinishedAt: { not: null },
              transcribingFinishedAt: { not: null },
              visibility: 'PUBLIC',
            },
            orderBy: {
              publishedAt: 'desc',
            },
            take: 1,
          },
          ...(appUserId && {
            subscribers: {
              where: {
                appUserId,
              },
              select: {
                appUserId: true,
              },
            },
          }),
        },
        where: {
          slug,
        },
      });

      if (!channel) {
        moduleLogger.warn('Channel not found', { slug });
        throw new Error('Channel not found');
      }

      if (channel.visibility !== 'PUBLIC' || !channel.approvedAt) {
        moduleLogger.warn('Channel not accessible', {
          slug,
          visibility: channel.visibility,
          approved: Boolean(channel.approvedAt),
        });
        throw new Error('Channel not found');
      }

      const avatarUrl = channel.avatarPath
        ? getPublicImageUrl(getS3ProtocolUri('PUBLIC', channel.avatarPath), {
            resize: { width: 128, height: 128 },
          })
        : null;

      // Use channel default thumbnail, or fallback to first upload thumbnail
      const fallbackThumbnailPath =
        channel.uploadRecords[0]?.overrideThumbnailPath ??
        channel.uploadRecords[0]?.defaultThumbnailPath;

      const defaultThumbnailUrl =
        channel.defaultThumbnailPath || fallbackThumbnailPath
          ? getPublicImageUrl(
              getS3ProtocolUri(
                'PUBLIC',
                channel.defaultThumbnailPath ?? fallbackThumbnailPath ?? '',
              ),
              { resize: { width: 1920, height: 1080 } },
            )
          : null;

      const isFollowing = appUserId
        ? 'subscribers' in channel && channel.subscribers.length > 0
        : false;

      return {
        id: channel.id,
        name: channel.name,
        slug: channel.slug,
        description: channel.description,
        avatarUrl,
        defaultThumbnailUrl,
        subscriberCount: channel._count.subscribers,
        isFollowing,
      };
    }),

  getChannelMedia: publicProcedure
    .input(channelMediaQuerySchema)
    .query(async ({ input }) => {
      const { slug, limit, cursor } = input;

      moduleLogger.info('Fetching channel media', {
        slug,
        limit,
        cursor,
      });

      const uploads = await db.uploadRecord.findMany({
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
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
          _count: {
            select: {
              uploadViews: true,
            },
          },
        },
        where: {
          transcodingFinishedAt: { not: null },
          transcribingFinishedAt: { not: null },
          visibility: 'PUBLIC',
          channel: {
            slug,
            visibility: 'PUBLIC',
            approvedAt: { not: null },
          },
          ...(cursor
            ? {
                publishedAt: {
                  lt: new Date(cursor),
                },
              }
            : {}),
        },
        orderBy: {
          publishedAt: 'desc',
        },
        take: limit + 1, // Fetch one extra to determine if there are more
      });

      const hasMore = uploads.length > limit;
      const items = hasMore ? uploads.slice(0, limit) : uploads;
      const nextCursor = hasMore
        ? (items[items.length - 1].publishedAt?.toISOString() ?? null)
        : null;

      const uploadsWithThumbnails = items.map((upload) => {
        const {
          defaultThumbnailPath,
          overrideThumbnailPath,
          channel,
          ...uploadRest
        } = upload;
        const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;
        const thumbnailUrl = thumbnailPath
          ? getPublicImageUrl(
              getS3ProtocolUri('PUBLIC', thumbnailPath),
              getThumbnailResize('card'),
            )
          : null;

        const channelAvatarUrl = channel.avatarPath
          ? getPublicImageUrl(getS3ProtocolUri('PUBLIC', channel.avatarPath), {
              resize: { width: 32, height: 32 },
            })
          : null;

        const channelDefaultThumbnailUrl = channel.defaultThumbnailPath
          ? getPublicImageUrl(
              getS3ProtocolUri('PUBLIC', channel.defaultThumbnailPath),
              getThumbnailResize('card'),
            )
          : null;

        return {
          ...uploadRest,
          thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
          channel: {
            ...channel,
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
