import { z } from 'zod';
import {
  getThumbnailResize,
  IncomingIdSchema,
  OutgoingIdSchema,
} from '@/schemas/common';
import { prisma } from '@/util/db';
import logger from '@/util/logger';
import { getS3ProtocolUri } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';
import { authProcedure, publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/home',
});

const homeUploadsQuerySchema = z.object({
  limit: z.number().min(1).max(60).default(20),
  cursor: z.number().optional(),
});

const suggestedChannelsQuerySchema = z.object({
  limit: z.number().min(1).max(20).default(7),
});

const followChannelSchema = z.object({
  channelId: IncomingIdSchema,
});

const unfollowChannelSchema = z.object({
  channelId: IncomingIdSchema,
});

const inProgressUploadsQuerySchema = z.object({
  limit: z.number().min(1).max(20).default(5),
});

export const homeProcedures = {
  getFollowedChannels: authProcedure.query(async ({ ctx }) => {
    moduleLogger.info('Fetching followed channels', {
      appUserId: ctx.session.appUserId,
    });

    const subscriptions = await prisma.channelSubscription.findMany({
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
        id: OutgoingIdSchema.parse(channel.id),
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

      const uploads = await prisma.uploadRecord.findMany({
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
          id: OutgoingIdSchema.parse(uploadRest.id),
          thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
          channel: {
            ...channel,
            id: OutgoingIdSchema.parse(channel.id),
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
        cursor: input.cursor,
      });

      const uploads = await prisma.uploadRecord.findMany({
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
        skip: input.cursor ?? 0,
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

        return {
          ...uploadRest,
          id: OutgoingIdSchema.parse(uploadRest.id),
          thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
          channel: {
            ...channel,
            id: OutgoingIdSchema.parse(channel.id),
            avatarUrl: channelAvatarUrl,
          },
        };
      });

      const nextCursor =
        uploads.length === input.limit
          ? (input.cursor ?? 0) + input.limit
          : undefined;

      return {
        items: uploadsWithThumbnails,
        nextCursor,
      };
    }),

  getSuggestedChannels: publicProcedure
    .input(suggestedChannelsQuerySchema)
    .query(async ({ ctx, input }) => {
      const appUserId = ctx.session?.appUserId;

      moduleLogger.info('Fetching suggested channels', {
        appUserId,
        limit: input.limit,
      });

      const channels = await prisma.channel.findMany({
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
          id: OutgoingIdSchema.parse(channel.id),
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
        await prisma.channelSubscription.create({
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
        await prisma.channelSubscription.delete({
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

  getInProgressUploads: authProcedure
    .input(inProgressUploadsQuerySchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info('Fetching in-progress uploads', {
        appUserId: ctx.session.appUserId,
        limit: input.limit,
      });

      // Get user's upload views with their most recent viewed seconds
      const views = await prisma.uploadView.findMany({
        where: {
          appUserId: ctx.session.appUserId,
        },
        select: {
          uploadRecordId: true,
          createdAt: true,
          upload: {
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
          },
          UploadViewSecond: {
            select: {
              second: true,
            },
            orderBy: {
              second: 'desc',
            },
            take: 1,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        distinct: ['uploadRecordId'], // Only show each video once (most recent view)
        take: input.limit * 3, // Fetch more since we'll filter
      });

      // Calculate progress and filter to 1-95%
      const uploadsWithProgress = views
        .map((view) => {
          const lastSecond = view.UploadViewSecond[0]?.second;
          if (lastSecond === undefined || !view.upload.lengthSeconds) {
            return null;
          }

          const progress = (lastSecond / view.upload.lengthSeconds) * 100;

          // Only include videos that are 1-95% complete
          if (progress < 1 || progress > 95) {
            return null;
          }

          const {
            defaultThumbnailPath,
            overrideThumbnailPath,
            channel,
            ...uploadRest
          } = view.upload;
          const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;
          const thumbnailUrl = thumbnailPath
            ? getPublicImageUrl(
                getS3ProtocolUri('PUBLIC', thumbnailPath),
                getThumbnailResize('card'),
              )
            : null;

          const channelAvatarUrl = channel.avatarPath
            ? getPublicImageUrl(
                getS3ProtocolUri('PUBLIC', channel.avatarPath),
                {
                  resize: { width: 32, height: 32 },
                },
              )
            : null;

          const channelDefaultThumbnailUrl = channel.defaultThumbnailPath
            ? getPublicImageUrl(
                getS3ProtocolUri('PUBLIC', channel.defaultThumbnailPath),
                getThumbnailResize('card'),
              )
            : null;

          return {
            ...uploadRest,
            id: OutgoingIdSchema.parse(uploadRest.id),
            thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
            progress,
            channel: {
              ...channel,
              id: OutgoingIdSchema.parse(channel.id),
              avatarUrl: channelAvatarUrl,
            },
          };
        })
        .filter(
          (upload): upload is NonNullable<typeof upload> => upload !== null,
        )
        .slice(0, input.limit);

      return uploadsWithProgress;
    }),

  getFeaturedUploads: publicProcedure.query(async () => {
    moduleLogger.info('Fetching featured uploads for homepage');

    const featuredUploads = await prisma.featuredUpload.findMany({
      select: {
        uploadRecord: {
          select: {
            id: true,
            title: true,
            description: true,
            lengthSeconds: true,
            defaultThumbnailPath: true,
            overrideThumbnailPath: true,
            defaultThumbnailBlurhash: true,
            overrideThumbnailBlurhash: true,
            channel: {
              select: {
                id: true,
                name: true,
                slug: true,
                avatarPath: true,
                avatarBlurhash: true,
              },
            },
          },
        },
      },
      where: {
        uploadRecord: {
          visibility: 'PUBLIC',
          transcodingFinishedAt: { not: null },
          transcribingFinishedAt: { not: null },
          channel: {
            visibility: 'PUBLIC',
          },
        },
      },
      orderBy: {
        rank: 'asc',
      },
    });

    const uploadsWithUrls = featuredUploads.map(({ uploadRecord }) => {
      const thumbnailPath =
        uploadRecord.overrideThumbnailPath ?? uploadRecord.defaultThumbnailPath;
      const thumbnailBlurhash =
        uploadRecord.overrideThumbnailBlurhash ??
        uploadRecord.defaultThumbnailBlurhash;

      // Use 720p for carousel backgrounds
      const thumbnailUrl = thumbnailPath
        ? getPublicImageUrl(getS3ProtocolUri('PUBLIC', thumbnailPath), {
            resize: { width: 1280, height: 720 },
          })
        : null;

      const channelAvatarUrl = uploadRecord.channel.avatarPath
        ? getPublicImageUrl(
            getS3ProtocolUri('PUBLIC', uploadRecord.channel.avatarPath),
            {
              resize: { width: 64, height: 64 },
            },
          )
        : null;

      return {
        id: OutgoingIdSchema.parse(uploadRecord.id),
        title: uploadRecord.title,
        description: uploadRecord.description,
        lengthSeconds: uploadRecord.lengthSeconds,
        thumbnailUrl,
        thumbnailBlurhash,
        channel: {
          id: OutgoingIdSchema.parse(uploadRecord.channel.id),
          name: uploadRecord.channel.name,
          slug: uploadRecord.channel.slug,
          avatarUrl: channelAvatarUrl,
          avatarBlurhash: uploadRecord.channel.avatarBlurhash,
        },
      };
    });

    return uploadsWithUrls;
  }),
};
