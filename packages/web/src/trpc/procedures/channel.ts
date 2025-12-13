import { prisma } from '@letschurch/db';
import { z } from 'zod';
import { getThumbnailResize, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarMd2x, appAvatarXs2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { publicS3 } from '@/util/s3';
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

const channelPlaylistsQuerySchema = z.object({
  slug: z.string(),
});

const channelChurchesQuerySchema = z.object({
  slug: z.string(),
});

export const channelProcedures = {
  getChannelBySlug: publicProcedure
    .input(channelQuerySchema)
    .query(async ({ input, ctx }) => {
      const { slug } = input;
      const appUserId = ctx.session?.appUserId;

      moduleLogger.info(
        { appUserId, context: { slug } },
        'Fetching channel by slug',
      );

      const channel = await prisma.channel.findUnique({
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          avatarPath: true,
          coverPath: true,
          defaultThumbnailPath: true,
          visibility: true,
          approvedAt: true,
          deletedAt: true,
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
          deletedAt: null,
        },
      });

      if (!channel) {
        moduleLogger.warn({ context: { slug } }, 'Channel not found');
        throw new Error('Channel not found');
      }

      if (
        channel.visibility !== 'PUBLIC' ||
        !channel.approvedAt ||
        channel.deletedAt
      ) {
        moduleLogger.warn(
          {
            context: {
              slug,
              visibility: channel.visibility,
              approved: Boolean(channel.approvedAt),
              deleted: Boolean(channel.deletedAt),
            },
          },
          'Channel not accessible',
        );
        throw new Error('Channel not found');
      }

      const avatarUrl = channel.avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
            resize: appAvatarMd2x,
          })
        : null;

      const coverUrl = channel.coverPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.coverPath), {
            resize: { width: 1920, height: 1080 },
          })
        : null;

      // Use channel default thumbnail, or fallback to first upload thumbnail
      const fallbackThumbnailPath =
        channel.uploadRecords[0]?.overrideThumbnailPath ??
        channel.uploadRecords[0]?.defaultThumbnailPath;

      const defaultThumbnailUrl =
        channel.defaultThumbnailPath || fallbackThumbnailPath
          ? getPublicImageUrl(
              publicS3.getS3ProtocolUri(
                channel.defaultThumbnailPath ?? fallbackThumbnailPath ?? '',
              ),
              { resize: { width: 1920, height: 1080 } },
            )
          : null;

      const isFollowing = appUserId
        ? 'subscribers' in channel && channel.subscribers.length > 0
        : false;

      return {
        id: OutgoingIdSchema.parse(channel.id),
        name: channel.name,
        slug: channel.slug,
        description: channel.description,
        avatarUrl,
        coverUrl,
        defaultThumbnailUrl,
        subscriberCount: channel._count.subscribers,
        isFollowing,
      };
    }),

  getChannelMedia: publicProcedure
    .input(channelMediaQuerySchema)
    .query(async ({ input }) => {
      const { slug, limit, cursor } = input;

      moduleLogger.info(
        { context: { slug, limit, cursor } },
        'Fetching channel media',
      );

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
            slug,
            visibility: 'PUBLIC',
            approvedAt: { not: null },
            deletedAt: null,
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

  getChannelPlaylists: publicProcedure
    .input(channelPlaylistsQuerySchema)
    .query(async ({ input }) => {
      const { slug } = input;

      moduleLogger.info({ context: { slug } }, 'Fetching channel playlists');

      const playlists = await prisma.uploadList.findMany({
        select: {
          id: true,
          title: true,
          type: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              uploads: true,
            },
          },
          uploads: {
            select: {
              upload: {
                select: {
                  defaultThumbnailPath: true,
                  overrideThumbnailPath: true,
                },
              },
            },
            orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
            take: 1,
          },
        },
        where: {
          channel: {
            slug,
            visibility: 'PUBLIC',
            approvedAt: { not: null },
            deletedAt: null,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return playlists.map((playlist) => {
        const firstUpload = playlist.uploads[0];
        const thumbnailPath =
          firstUpload?.upload.overrideThumbnailPath ??
          firstUpload?.upload.defaultThumbnailPath;

        const thumbnailUrl = thumbnailPath
          ? getPublicImageUrl(
              publicS3.getS3ProtocolUri(thumbnailPath),
              getThumbnailResize('card'),
            )
          : null;

        return {
          id: OutgoingIdSchema.parse(playlist.id),
          title: playlist.title,
          type: playlist.type,
          createdAt: playlist.createdAt,
          updatedAt: playlist.updatedAt,
          uploadCount: playlist._count.uploads,
          thumbnailUrl,
        };
      });
    }),

  getChannelChurches: publicProcedure
    .input(channelChurchesQuerySchema)
    .query(async ({ input }) => {
      const { slug } = input;

      moduleLogger.info({ context: { slug } }, 'Fetching channel churches');

      const associations = await prisma.organizationChannelAssociation.findMany(
        {
          select: {
            organization: {
              select: {
                id: true,
                type: true,
                name: true,
                slug: true,
                avatarPath: true,
                description: true,
              },
            },
            officialChannel: true,
          },
          where: {
            channel: {
              slug,
              visibility: 'PUBLIC',
              approvedAt: { not: null },
              deletedAt: null,
            },
            organization: {
              type: 'CHURCH',
              approvedAt: { not: null },
            },
          },
          orderBy: [
            { officialChannel: 'desc' }, // Official first
            { organization: { name: 'asc' } },
          ],
        },
      );

      return associations.map((assoc) => {
        const avatarUrl = assoc.organization.avatarPath
          ? getPublicImageUrl(
              publicS3.getS3ProtocolUri(assoc.organization.avatarPath),
              { resize: appAvatarMd2x },
            )
          : null;

        return {
          id: OutgoingIdSchema.parse(assoc.organization.id),
          type: assoc.organization.type,
          name: assoc.organization.name,
          slug: assoc.organization.slug,
          avatarUrl,
          description: assoc.organization.description,
          isOfficial: assoc.officialChannel,
        };
      });
    }),
};
