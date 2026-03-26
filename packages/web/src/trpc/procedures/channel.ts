import { Channel, ChannelSubscription, db } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
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

      const channel = await db.query.Channel.findFirst({
        columns: {
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
        },
        with: {
          uploadRecords: {
            columns: {
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
              transcodingFinishedAt: true,
              visibility: true,
            },
            where: (t, { and, isNotNull, eq }) =>
              and(
                isNotNull(t.transcodingFinishedAt),
                eq(t.visibility, 'PUBLIC'),
              ),
            orderBy: (t, { desc }) => [desc(t.publishedAt)],
            limit: 1,
          },
          subscribers: {
            columns: {
              appUserId: true,
            },
          },
        },
        where: (t, { and, eq, isNull }) =>
          and(eq(t.slug, slug), isNull(t.deletedAt)),
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
        ? channel.subscribers.some((s) => s.appUserId === appUserId)
        : false;

      const subscriberCount = channel.subscribers.length;

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
        subscriberCount,
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

      // First look up the channel by slug to ensure it exists and is public
      const channelRecord = await db.query.Channel.findFirst({
        columns: {
          id: true,
          visibility: true,
          approvedAt: true,
          deletedAt: true,
          defaultThumbnailPath: true,
          avatarPath: true,
          name: true,
          slug: true,
        },
        where: (t, { eq }) => eq(t.slug, slug),
      });

      if (
        !channelRecord ||
        channelRecord.visibility !== 'PUBLIC' ||
        !channelRecord.approvedAt ||
        channelRecord.deletedAt
      ) {
        return { items: [], nextCursor: null };
      }

      const uploads = await db.query.UploadRecord.findMany({
        columns: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          publishedAt: true,
          lengthSeconds: true,
          defaultThumbnailPath: true,
          overrideThumbnailPath: true,
          transcodingFinishedAt: true,
          visibility: true,
          deletedAt: true,
        },
        with: {
          channel: {
            columns: {
              id: true,
              name: true,
              slug: true,
              avatarPath: true,
              defaultThumbnailPath: true,
            },
          },
        },
        where: (t, { and, isNotNull, isNull, eq, lt }) =>
          and(
            isNotNull(t.transcodingFinishedAt),
            eq(t.visibility, 'PUBLIC'),
            isNull(t.deletedAt),
            eq(t.channelId, channelRecord.id),
            ...(cursor ? [lt(t.publishedAt, new Date(cursor))] : []),
          ),
        orderBy: (t, { desc }) => [desc(t.publishedAt)],
        limit: limit + 1, // Fetch one extra to determine if there are more
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
          transcodingFinishedAt: _transcodingFinishedAt,
          visibility: _visibility,
          deletedAt: _deletedAt,
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

      // First look up the channel by slug
      const channelRecord = await db.query.Channel.findFirst({
        columns: {
          id: true,
          visibility: true,
          approvedAt: true,
          deletedAt: true,
          defaultThumbnailPath: true,
        },
        where: (t, { eq }) => eq(t.slug, slug),
      });

      if (
        !channelRecord ||
        channelRecord.visibility !== 'PUBLIC' ||
        !channelRecord.approvedAt ||
        channelRecord.deletedAt
      ) {
        return [];
      }

      const playlists = await db.query.UploadList.findMany({
        columns: {
          id: true,
          title: true,
          type: true,
          createdAt: true,
          updatedAt: true,
        },
        with: {
          channel: {
            columns: {
              defaultThumbnailPath: true,
            },
          },
          uploads: {
            columns: {},
            with: {
              upload: {
                columns: {
                  defaultThumbnailPath: true,
                  overrideThumbnailPath: true,
                  id: true,
                  visibility: true,
                  deletedAt: true,
                  transcodingFinishedAt: true,
                },
              },
            },
            orderBy: (t, { asc }) => [asc(t.rank), asc(t.createdAt)],
          },
        },
        where: (t, { eq }) => eq(t.channelId, channelRecord.id),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      return playlists.map((playlist) => {
        const visibleUploads = playlist.uploads.filter(
          (u) =>
            u.upload.visibility === 'PUBLIC' &&
            u.upload.deletedAt === null &&
            u.upload.transcodingFinishedAt !== null,
        );
        const firstUpload = visibleUploads[0];

        const thumbnailUrl = resolveThumbnailUrl({
          overrideThumbnailPath: firstUpload?.upload.overrideThumbnailPath,
          defaultThumbnailPath: firstUpload?.upload.defaultThumbnailPath,
          channelDefaultThumbnailPath: playlist.channel?.defaultThumbnailPath,
          size: 'card',
        });

        const uploadCount = visibleUploads.length;

        return {
          id: OutgoingIdSchema.parse(playlist.id),
          title: playlist.title,
          type: playlist.type,
          createdAt: playlist.createdAt,
          updatedAt: playlist.updatedAt,
          uploadCount,
          thumbnailUrl,
        };
      });
    }),

  getChannelChurches: publicProcedure
    .input(channelChurchesQuerySchema)
    .query(async ({ input }) => {
      const { slug } = input;

      moduleLogger.info({ context: { slug } }, 'Fetching channel churches');

      // First look up the channel by slug
      const channelRecord = await db.query.Channel.findFirst({
        columns: {
          id: true,
          visibility: true,
          approvedAt: true,
          deletedAt: true,
        },
        where: (t, { eq }) => eq(t.slug, slug),
      });

      if (
        !channelRecord ||
        channelRecord.visibility !== 'PUBLIC' ||
        !channelRecord.approvedAt ||
        channelRecord.deletedAt
      ) {
        return [];
      }

      const associations =
        await db.query.OrganizationChannelAssociation.findMany({
          columns: {
            officialChannel: true,
          },
          with: {
            organization: {
              columns: {
                id: true,
                type: true,
                name: true,
                slug: true,
                avatarPath: true,
                description: true,
                approvedAt: true,
              },
            },
          },
          where: (t, { and, eq }) => and(eq(t.channelId, channelRecord.id)),
        });

      // Filter to CHURCH organizations that are approved, then sort
      const filteredAssociations = associations
        .filter(
          (assoc) =>
            assoc.organization.type === 'CHURCH' &&
            assoc.organization.approvedAt !== null,
        )
        .sort((a, b) => {
          // Official first, then by name
          if (a.officialChannel !== b.officialChannel) {
            return a.officialChannel ? -1 : 1;
          }
          return a.organization.name.localeCompare(b.organization.name);
        });

      return filteredAssociations.map((assoc) => {
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

      const offset = cursor ?? 0;

      if (sortBy === 'subscribers') {
        // Use SQL-style query to order by subscriber count
        const subscriberCountSq = db
          .select({
            channelId: ChannelSubscription.channelId,
            cnt: count().as('cnt'),
          })
          .from(ChannelSubscription)
          .groupBy(ChannelSubscription.channelId)
          .as('subscriber_counts');

        const whereConditions = [
          eq(Channel.visibility, 'PUBLIC'),
          isNotNull(Channel.approvedAt),
          isNull(Channel.deletedAt),
          ...(search ? [ilike(Channel.name, `%${search}%`)] : []),
        ];

        const channels = await db
          .select({
            id: Channel.id,
            name: Channel.name,
            slug: Channel.slug,
            description: Channel.description,
            avatarPath: Channel.avatarPath,
            createdAt: Channel.createdAt,
            subscriberCount: sql<number>`coalesce(${subscriberCountSq.cnt}, 0)`,
          })
          .from(Channel)
          .leftJoin(
            subscriberCountSq,
            eq(Channel.id, subscriberCountSq.channelId),
          )
          .where(and(...whereConditions))
          .orderBy(
            desc(sql`coalesce(${subscriberCountSq.cnt}, 0)`),
            asc(Channel.id),
          )
          .limit(limit + 1)
          .offset(offset);

        const hasMore = channels.length > limit;
        const items = hasMore ? channels.slice(0, limit) : channels;
        const nextCursor = hasMore ? offset + limit : null;

        return {
          items: items.map((channel) => {
            const avatarUrl = channel.avatarPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(channel.avatarPath),
                  {
                    resize: appAvatarMd2x,
                  },
                )
              : null;

            return {
              id: OutgoingIdSchema.parse(channel.id),
              name: channel.name,
              slug: channel.slug,
              description: channel.description,
              avatarUrl,
              subscriberCount: channel.subscriberCount,
            };
          }),
          nextCursor,
        };
      }

      // For 'name' and 'newest' sorting, use relational API
      const channels = await db.query.Channel.findMany({
        columns: {
          id: true,
          name: true,
          slug: true,
          description: true,
          avatarPath: true,
          createdAt: true,
        },
        with: {
          subscribers: {
            columns: { appUserId: true },
          },
        },
        where: (t, { and, eq, isNotNull, isNull, ilike }) =>
          and(
            eq(t.visibility, 'PUBLIC'),
            isNotNull(t.approvedAt),
            isNull(t.deletedAt),
            ...(search ? [ilike(t.name, `%${search}%`)] : []),
          ),
        orderBy:
          sortBy === 'name'
            ? (t, { asc }) => [asc(t.name), asc(t.id)]
            : (t, { desc, asc }) => [desc(t.createdAt), asc(t.id)],
        offset,
        limit: limit + 1,
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
            subscriberCount: channel.subscribers.length,
          };
        }),
        nextCursor,
      };
    }),
};
