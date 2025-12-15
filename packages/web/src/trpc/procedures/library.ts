import { prisma } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarXs2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { getPublicImageUrl } from '@/util/url';
import { authProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/library',
});

const saveMediaSchema = z.object({
  mediaId: IncomingIdSchema,
});

const libraryQuerySchema = z.object({
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().nullable().optional(), // ISO date string
});

export const libraryProcedures = {
  saveMedia: authProcedure
    .input(saveMediaSchema)
    .mutation(async ({ input, ctx }) => {
      const { mediaId } = input;
      const userId = ctx.session.appUserId;

      moduleLogger.info('Toggling saved media');

      // Check if user already saved this media
      const existingSave = await prisma.savedMedia.findUnique({
        where: {
          appUserId_uploadRecordId: {
            appUserId: userId,
            uploadRecordId: mediaId,
          },
        },
      });

      if (existingSave) {
        // User is clicking save again - remove it (toggle off)
        await prisma.savedMedia.delete({
          where: {
            appUserId_uploadRecordId: {
              appUserId: userId,
              uploadRecordId: mediaId,
            },
          },
        });

        moduleLogger.info('Media unsaved');

        return { saved: false };
      } else {
        // User is saving for the first time
        await prisma.savedMedia.create({
          data: {
            appUserId: userId,
            uploadRecordId: mediaId,
          },
        });

        moduleLogger.info('Media saved');

        return { saved: true };
      }
    }),

  // isSaved: authProcedure
  //   .input(z.object({ mediaId: z.uuid() }))
  //   .query(async ({ input, ctx }) => {
  //     const saved = await prisma.savedMedia.findUnique({
  //       where: {
  //         appUserId_uploadRecordId: {
  //           appUserId: ctx.session.appUserId,
  //           uploadRecordId: input.mediaId,
  //         },
  //       },
  //     });
  //
  //     return { saved: Boolean(saved) };
  //   }),

  getSavedMedia: authProcedure
    .input(libraryQuerySchema)
    .query(async ({ input, ctx }) => {
      const { limit, cursor } = input;

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Fetching saved media',
      );

      const savedMedia = await prisma.savedMedia.findMany({
        select: {
          createdAt: true,
          uploadRecord: {
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
        },
        where: {
          appUserId: ctx.session.appUserId,
          ...(cursor
            ? {
                createdAt: {
                  lt: new Date(cursor),
                },
              }
            : {}),
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit + 1, // Fetch one extra to determine if there are more
      });

      const hasMore = savedMedia.length > limit;
      const items = hasMore ? savedMedia.slice(0, limit) : savedMedia;
      const nextCursor = hasMore
        ? items[items.length - 1].createdAt.toISOString()
        : null;

      const uploadsWithThumbnails = items.map(({ uploadRecord }) => {
        const {
          defaultThumbnailPath,
          overrideThumbnailPath,
          channel,
          ...uploadRest
        } = uploadRecord;

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

  getHistory: authProcedure
    .input(libraryQuerySchema)
    .query(async ({ input, ctx }) => {
      const { limit, cursor } = input;

      moduleLogger.info(
        {
          appUserId: ctx.session.appUserId,
        },
        'Fetching watch history',
      );

      const history = await prisma.uploadView.findMany({
        select: {
          createdAt: true,
          uploadRecordId: true,
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
        where: {
          appUserId: ctx.session.appUserId,
          ...(cursor
            ? {
                createdAt: {
                  lt: new Date(cursor),
                },
              }
            : {}),
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit + 1, // Fetch one extra to determine if there are more
        distinct: ['uploadRecordId'], // Only show each video once (most recent view)
      });

      const hasMore = history.length > limit;
      const items = hasMore ? history.slice(0, limit) : history;
      const nextCursor = hasMore
        ? items[items.length - 1].createdAt.toISOString()
        : null;

      const uploadsWithThumbnails = items.map(
        ({ upload, UploadViewSecond }) => {
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

          const lastSecond = UploadViewSecond[0]?.second;
          const progress =
            lastSecond !== undefined && upload.lengthSeconds
              ? (lastSecond / upload.lengthSeconds) * 100
              : undefined;

          return {
            ...uploadRest,
            id: OutgoingIdSchema.parse(uploadRest.id),
            thumbnailUrl,
            progress,
            channel: {
              ...channel,
              id: OutgoingIdSchema.parse(channel.id),
              avatarUrl: channelAvatarUrl,
            },
          };
        },
      );

      return {
        items: uploadsWithThumbnails,
        nextCursor,
      };
    }),
};
