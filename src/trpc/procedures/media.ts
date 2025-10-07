import { z } from 'zod';
import { getThumbnailResize } from '@/schemas/common';
import db from '@/util/db';
import logger from '@/util/logger';
import { getS3ProtocolUri } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';
import { publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/media',
});

const getMediaByIdSchema = z.object({
  mediaId: z.uuid(),
});

export const mediaProcedures = {
  getMediaById: publicProcedure
    .input(getMediaByIdSchema)
    .query(async ({ input }) => {
      moduleLogger.info('Fetching media by ID', {
        mediaId: input.mediaId,
      });

      const media = await db.uploadRecord.findUnique({
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
              _count: {
                select: {
                  subscribers: true,
                },
              },
            },
          },
          _count: {
            select: {
              uploadViews: true,
            },
          },
        },
        where: {
          id: input.mediaId,
        },
      });

      if (!media) {
        throw new Error('Media not found');
      }

      const {
        defaultThumbnailPath,
        overrideThumbnailPath,
        channel,
        ...mediaRest
      } = media;

      const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;
      const thumbnailUrl = thumbnailPath
        ? getPublicImageUrl(
            getS3ProtocolUri('PUBLIC', thumbnailPath),
            getThumbnailResize('card'),
          )
        : null;

      const fullSizeThumbnailUrl = thumbnailPath
        ? getPublicImageUrl(
            getS3ProtocolUri('PUBLIC', thumbnailPath),
            getThumbnailResize('featured'),
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
        ...mediaRest,
        thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
        fullSizeThumbnailUrl:
          fullSizeThumbnailUrl || channelDefaultThumbnailUrl,
        channel: {
          id: channel.id,
          name: channel.name,
          slug: channel.slug,
          avatarUrl: channelAvatarUrl,
          subscriberCount: channel._count.subscribers,
        },
      };
    }),
};
