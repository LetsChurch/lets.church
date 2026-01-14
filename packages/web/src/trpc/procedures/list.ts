import { prisma } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarXs2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/list',
});

const listQuerySchema = z.object({
  listId: IncomingIdSchema,
});

export const listProcedures = {
  getAllListItems: publicProcedure
    .input(listQuerySchema)
    .query(async ({ input }) => {
      const { listId } = input;

      moduleLogger.info({ context: { listId } }, 'Fetching all list items');

      // First verify list exists and get its type
      const list = await prisma.uploadList.findUnique({
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
          id: listId,
        },
      });

      if (!list) {
        moduleLogger.warn({ context: { listId } }, 'List not found');
        throw new Error('List not found');
      }

      // Validate list type
      if (list.type !== 'PLAYLIST' && list.type !== 'SERIES') {
        moduleLogger.warn(
          { context: { listId, type: list.type } },
          'Invalid list type',
        );
        throw new Error('List not found');
      }

      if (!list.channel) {
        moduleLogger.warn({ context: { listId } }, 'List has no channel');
        throw new Error('List not found');
      }

      if (
        list.channel.visibility !== 'PUBLIC' ||
        !list.channel.approvedAt ||
        list.channel.deletedAt
      ) {
        moduleLogger.warn(
          {
            context: {
              listId,
              channelVisibility: list.channel.visibility,
              channelApproved: Boolean(list.channel.approvedAt),
              channelDeleted: Boolean(list.channel.deletedAt),
            },
          },
          'Channel not accessible',
        );
        throw new Error('List not found');
      }

      // Fetch all list entries
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
          uploadListId: listId,
          upload: {
            visibility: 'PUBLIC',
            transcodingFinishedAt: { not: null },
            transcribingFinishedAt: { not: null },
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
        title: list.title,
        type: list.type,
        items,
      };
    }),
};
