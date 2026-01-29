import { prisma } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { z } from 'zod';
import { OutgoingIdSchema } from '@/schemas/common';
import { appAvatarMd2x, appAvatarXs2x } from '@/util/avatar-sizes';
import { coverImageFull } from '@/util/image-sizes';
import logger from '@/util/logger';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { ResizeType } from '@/util/url';
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

const listPublicChannelsQuerySchema = z.object({
  search: z.string().optional(),
  sortBy: z.enum(['name', 'subscribers', 'newest']).default('subscribers'),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.number().nullable().optional(), // Offset for pagination
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
          websiteUrl: true,
          facebookUrl: true,
          instagramUrl: true,
          xUrl: true,
          youtubeUrl: true,
          tiktokUrl: true,
          linkedinUrl: true,
          threadsUrl: true,
          applePodcastsUrl: true,
          spotifyUrl: true,
          rssUrl: true,
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
            resize: coverImageFull,
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
              { resize: { type: ResizeType.FILL, width: 1920, height: 1080 } },
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
        websiteUrl: channel.websiteUrl,
        facebookUrl: channel.facebookUrl,
        instagramUrl: channel.instagramUrl,
        xUrl: channel.xUrl,
        youtubeUrl: channel.youtubeUrl,
        tiktokUrl: channel.tiktokUrl,
        linkedinUrl: channel.linkedinUrl,
        threadsUrl: channel.threadsUrl,
        applePodcastsUrl: channel.applePodcastsUrl,
        spotifyUrl: channel.spotifyUrl,
        rssUrl: channel.rssUrl,
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
          channel: {
            select: {
              defaultThumbnailPath: true,
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

        const thumbnailUrl = resolveThumbnailUrl({
          overrideThumbnailPath: firstUpload?.upload.overrideThumbnailPath,
          defaultThumbnailPath: firstUpload?.upload.defaultThumbnailPath,
          channelDefaultThumbnailPath: playlist.channel?.defaultThumbnailPath,
          size: 'card',
        });

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

  listPublicChannels: publicProcedure
    .input(listPublicChannelsQuerySchema)
    .query(async ({ input }) => {
      const { search, sortBy, limit, cursor } = input;

      moduleLogger.info(
        { context: { search, sortBy, limit, cursor } },
        'Listing public channels',
      );

      const orderBy =
        sortBy === 'name'
          ? [{ name: 'asc' as const }, { id: 'asc' as const }]
          : sortBy === 'subscribers'
            ? [
                { subscribers: { _count: 'desc' as const } },
                { id: 'asc' as const },
              ]
            : [{ createdAt: 'desc' as const }, { id: 'asc' as const }];

      const offset = cursor ?? 0;

      const channels = await prisma.channel.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          avatarPath: true,
          createdAt: true,
          _count: {
            select: {
              subscribers: true,
            },
          },
        },
        where: {
          visibility: 'PUBLIC',
          approvedAt: { not: null },
          deletedAt: null,
          ...(search
            ? {
                name: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              }
            : {}),
        },
        orderBy,
        skip: offset,
        take: limit + 1,
      });

      const hasMore = channels.length > limit;
      const items = hasMore ? channels.slice(0, limit) : channels;
      const nextCursor = hasMore ? offset + limit : null;

      return {
        items: items.map((channel) => {
          const avatarUrl = channel.avatarPath
            ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
                resize: appAvatarMd2x,
              })
            : null;

          return {
            id: OutgoingIdSchema.parse(channel.id),
            name: channel.name,
            slug: channel.slug,
            description: channel.description,
            avatarUrl,
            subscriberCount: channel._count.subscribers,
          };
        }),
        nextCursor,
      };
    }),
};
