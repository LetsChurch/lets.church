import { z } from 'zod';
import { getThumbnailResize } from '@/schemas/common';
import db from '@/util/db';
import logger from '@/util/logger';
import { getS3ProtocolUri } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';
import { authProcedure, publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/home',
});

const homeUploadsQuerySchema = z.object({
  limit: z.number().min(1).max(60).default(20),
});

const suggestedChannelsQuerySchema = z.object({
  limit: z.number().min(1).max(20).default(7),
});

const followChannelSchema = z.object({
  channelId: z.uuid(),
});

const unfollowChannelSchema = z.object({
  channelId: z.uuid(),
});

export const homeProcedures = {
  getFollowedChannels: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info('Fetching followed channels', {
      appUserId: ctx.session.appUserId,
    });

    const subscriptions = await db.channelSubscription.findMany({
      select: {
        channel: {
          select: {
            id: true,
            name: true,
            slug: true,
            avatarPath: true,
          },
        },
      },
      where: {
        appUserId: ctx.session.appUserId,
      },
    });

    const channelsWithAvatars = subscriptions.map(({ channel }) => {
      const avatarUrl = channel.avatarPath
        ? getPublicImageUrl(getS3ProtocolUri('PUBLIC', channel.avatarPath), {
            resize: { width: 64, height: 64 },
          })
        : null;

      return {
        ...channel,
        avatarUrl,
      };
    });

    return channelsWithAvatars;
  }),

  getSubscriptionUploads: authProcedure
    .input(homeUploadsQuerySchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info('Fetching subscription uploads', {
        appUserId: ctx.session.appUserId,
        limit: input.limit,
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
            subscribers: {
              some: {
                appUserId: ctx.session.appUserId,
              },
            },
          },
        },
        orderBy: {
          publishedAt: 'desc',
        },
        take: input.limit,
      });

      const uploadsWithThumbnails = uploads.map((upload) => {
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
              getThumbnailResize('saved'),
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
              getThumbnailResize('saved'),
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

      return uploadsWithThumbnails;
    }),

  getTrendingUploads: publicProcedure
    .input(homeUploadsQuerySchema)
    .query(async ({ input }) => {
      moduleLogger.info('Fetching trending uploads', {
        limit: input.limit,
      });

      const uploads = await db.uploadRecord.findMany({
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          publishedAt: true,
          lengthSeconds: true,
          score: true,
          defaultThumbnailPath: true,
          overrideThumbnailPath: true,
          channel: {
            select: {
              id: true,
              name: true,
              slug: true,
              avatarPath: true,
              defaultThumbnailPath: true,
              visibility: true,
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
            visibility: 'PUBLIC',
          },
        },
        orderBy: {
          score: 'desc',
        },
        take: input.limit,
      });

      const uploadsWithThumbnails = uploads.map((upload) => {
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

        console.log({ avatarPath: channel.avatarPath, channelAvatarUrl });

        return {
          ...uploadRest,
          thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
          channel: {
            ...channel,
            avatarUrl: channelAvatarUrl,
          },
        };
      });

      return uploadsWithThumbnails;
    }),

  getSuggestedChannels: publicProcedure
    .input(suggestedChannelsQuerySchema)
    .query(async ({ ctx, input }) => {
      const appUserId = ctx.session?.appUserId;

      moduleLogger.info('Fetching suggested channels', {
        appUserId,
        limit: input.limit,
      });

      const channels = await db.channel.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          avatarPath: true,
          _count: {
            select: {
              subscribers: true,
            },
          },
        },
        where: {
          visibility: 'PUBLIC',
          approvedAt: { not: null },
          ...(appUserId && {
            subscribers: {
              none: {
                appUserId,
              },
            },
          }),
        },
        orderBy: {
          subscribers: {
            _count: 'desc',
          },
        },
        take: input.limit,
      });

      const channelsWithAvatars = channels.map((channel) => {
        const avatarUrl = channel.avatarPath
          ? getPublicImageUrl(getS3ProtocolUri('PUBLIC', channel.avatarPath), {
              resize: { width: 64, height: 64 },
            })
          : null;

        return {
          ...channel,
          avatarUrl,
          followerCount: channel._count.subscribers,
        };
      });

      return channelsWithAvatars;
    }),

  followChannel: authProcedure
    .input(followChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Following channel', {
        appUserId: ctx.session.appUserId,
        channelId: input.channelId,
      });

      try {
        await db.channelSubscription.create({
          data: {
            appUserId: ctx.session.appUserId,
            channelId: input.channelId,
          },
        });

        moduleLogger.info('Channel followed successfully', {
          appUserId: ctx.session.appUserId,
          channelId: input.channelId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to follow channel', {
          appUserId: ctx.session.appUserId,
          channelId: input.channelId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new Error('Failed to follow channel');
      }
    }),

  unfollowChannel: authProcedure
    .input(unfollowChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info('Unfollowing channel', {
        appUserId: ctx.session.appUserId,
        channelId: input.channelId,
      });

      try {
        await db.channelSubscription.delete({
          where: {
            appUserId_channelId: {
              appUserId: ctx.session.appUserId,
              channelId: input.channelId,
            },
          },
        });

        moduleLogger.info('Channel unfollowed successfully', {
          appUserId: ctx.session.appUserId,
          channelId: input.channelId,
        });

        return { success: true };
      } catch (error) {
        moduleLogger.error('Failed to unfollow channel', {
          appUserId: ctx.session.appUserId,
          channelId: input.channelId,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new Error('Failed to unfollow channel');
      }
    }),
};
