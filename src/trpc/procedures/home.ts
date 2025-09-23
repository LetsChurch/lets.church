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

export const homeProcedures = {
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
};
