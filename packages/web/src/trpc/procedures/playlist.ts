import { prisma } from '@letschurch/db';
import { z } from 'zod';
import {
  getThumbnailResize,
  IncomingIdSchema,
  OutgoingIdSchema,
} from '@/schemas/common';
import { appAvatarMd2x, appAvatarXs2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { publicS3 } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';
import { publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/playlist',
});

const playlistQuerySchema = z.object({
  playlistId: IncomingIdSchema,
});

const playlistMediaQuerySchema = z.object({
  playlistId: IncomingIdSchema,
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().nullable().optional(), // ISO date string
});

export const playlistProcedures = {
  getPublicPlaylist: publicProcedure
    .input(playlistQuerySchema)
    .query(async ({ input }) => {
      const { playlistId } = input;

      moduleLogger.info(
        { context: { playlistId } },
        'Fetching public playlist',
      );

      const playlist = await prisma.uploadList.findUnique({
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
          id: playlistId,
        },
      });

      if (!playlist) {
        moduleLogger.warn({ context: { playlistId } }, 'Playlist not found');
        throw new Error('Playlist not found');
      }

      if (playlist.type !== 'PLAYLIST') {
        moduleLogger.warn(
          { context: { playlistId, type: playlist.type } },
          'Not a playlist',
        );
        throw new Error('Playlist not found');
      }

      // Check if channel exists and is public/approved
      if (!playlist.channel) {
        moduleLogger.warn(
          { context: { playlistId } },
          'Playlist has no channel',
        );
        throw new Error('Playlist not found');
      }

      if (
        playlist.channel.visibility !== 'PUBLIC' ||
        !playlist.channel.approvedAt ||
        playlist.channel.deletedAt
      ) {
        moduleLogger.warn(
          {
            context: {
              playlistId,
              channelVisibility: playlist.channel.visibility,
              channelApproved: Boolean(playlist.channel.approvedAt),
              channelDeleted: Boolean(playlist.channel.deletedAt),
            },
          },
          'Channel not accessible',
        );
        throw new Error('Playlist not found');
      }

      const authorAvatarUrl = playlist.author.avatarPath
        ? getPublicImageUrl(
            publicS3.getS3ProtocolUri(playlist.author.avatarPath),
            {
              resize: appAvatarMd2x,
            },
          )
        : null;

      const channelAvatarUrl = playlist.channel.avatarPath
        ? getPublicImageUrl(
            publicS3.getS3ProtocolUri(playlist.channel.avatarPath),
            {
              resize: appAvatarXs2x,
            },
          )
        : null;

      return {
        id: OutgoingIdSchema.parse(playlist.id),
        title: playlist.title,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
        author: {
          id: OutgoingIdSchema.parse(playlist.author.id),
          username: playlist.author.username,
          avatarUrl: authorAvatarUrl,
        },
        channel: {
          id: OutgoingIdSchema.parse(playlist.channel.id),
          name: playlist.channel.name,
          slug: playlist.channel.slug,
          avatarUrl: channelAvatarUrl,
        },
        uploadCount: playlist._count.uploads,
      };
    }),

  getPublicPlaylistMedia: publicProcedure
    .input(playlistMediaQuerySchema)
    .query(async ({ input }) => {
      const { playlistId, limit, cursor } = input;

      moduleLogger.info(
        { context: { playlistId, limit, cursor } },
        'Fetching public playlist media',
      );

      // First verify playlist exists and channel is public
      const playlist = await prisma.uploadList.findUnique({
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
          id: playlistId,
        },
      });

      if (!playlist || playlist.type !== 'PLAYLIST') {
        moduleLogger.warn({ context: { playlistId } }, 'Playlist not found');
        throw new Error('Playlist not found');
      }

      if (!playlist.channel) {
        moduleLogger.warn(
          { context: { playlistId } },
          'Playlist has no channel',
        );
        throw new Error('Playlist not found');
      }

      if (
        playlist.channel.visibility !== 'PUBLIC' ||
        !playlist.channel.approvedAt ||
        playlist.channel.deletedAt
      ) {
        moduleLogger.warn(
          {
            context: {
              playlistId,
              channelVisibility: playlist.channel.visibility,
              channelApproved: Boolean(playlist.channel.approvedAt),
              channelDeleted: Boolean(playlist.channel.deletedAt),
            },
          },
          'Channel not accessible',
        );
        throw new Error('Playlist not found');
      }

      // Fetch playlist entries with uploads
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
          uploadListId: playlistId,
          upload: {
            visibility: 'PUBLIC',
            transcodingFinishedAt: { not: null },
            transcribingFinishedAt: { not: null },
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
        const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;
        const thumbnailUrl = thumbnailPath
          ? getPublicImageUrl(
              publicS3.getS3ProtocolUri(thumbnailPath),
              getThumbnailResize('card'),
            )
          : null;

        const channelAvatarUrl = channel.avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
              resize: appAvatarXs2x,
            })
          : null;

        const channelDefaultThumbnailUrl = channel.defaultThumbnailPath
          ? getPublicImageUrl(
              publicS3.getS3ProtocolUri(channel.defaultThumbnailPath),
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

      return {
        items: uploadsWithThumbnails,
        nextCursor,
      };
    }),
};
