import {
  Channel,
  ChannelSubscription,
  db,
  UploadList,
  UploadListEntry,
  UploadRecord,
} from '@letschurch/db';
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
import {
  getMemberChannelIds,
  getVisibleLiveBroadcastVisibilities,
} from '@/util/media-visibility';
import { escapeLikePattern } from '@/util/misc';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { ResizeType } from '@/util/url';

import type { Context } from '../context';
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

async function getViewerLiveBroadcastVisibilities(
  channelId: string,
  ctx: Pick<Context, 'session' | 'isSiteAdmin'>,
) {
  const isChannelMember = ctx.isSiteAdmin
    ? false
    : (await getMemberChannelIds(ctx.session?.appUserId)).has(channelId);

  return getVisibleLiveBroadcastVisibilities({
    isSiteAdmin: ctx.isSiteAdmin,
    isChannelMember,
  });
}

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

      const uploadCountSq = db
        .select({
          channelId: UploadRecord.channelId,
          cnt: count().as('upload_cnt'),
        })
        .from(UploadRecord)
        .where(
          and(
            eq(UploadRecord.visibility, 'PUBLIC'),
            isNotNull(UploadRecord.transcodingFinishedAt),
            isNull(UploadRecord.deletedAt),
          ),
        )
        .groupBy(UploadRecord.channelId)
        .as('upload_counts');

      const subscriberCountSq = db
        .select({
          channelId: ChannelSubscription.channelId,
          cnt: count().as('subscriber_cnt'),
        })
        .from(ChannelSubscription)
        .groupBy(ChannelSubscription.channelId)
        .as('subscriber_counts');

      const isFollowingSq = db
        .select({ channelId: ChannelSubscription.channelId })
        .from(ChannelSubscription)
        .where(
          appUserId ? eq(ChannelSubscription.appUserId, appUserId) : sql`false`,
        )
        .as('is_following');

      const fallbackThumbnailSq = db
        .selectDistinctOn([UploadRecord.channelId], {
          channelId: UploadRecord.channelId,
          thumbnailPath: sql<
            string | null
          >`coalesce(${UploadRecord.overrideThumbnailPath}, ${UploadRecord.defaultThumbnailPath})`.as(
            'thumbnail_path',
          ),
        })
        .from(UploadRecord)
        .where(
          and(
            eq(UploadRecord.visibility, 'PUBLIC'),
            isNotNull(UploadRecord.transcodingFinishedAt),
            isNull(UploadRecord.deletedAt),
          ),
        )
        .orderBy(UploadRecord.channelId, desc(UploadRecord.publishedAt))
        .as('fallback_thumbnails');

      const [channel] = await db
        .select({
          id: Channel.id,
          name: Channel.name,
          slug: Channel.slug,
          description: Channel.description,
          avatarPath: Channel.avatarPath,
          coverPath: Channel.coverPath,
          defaultThumbnailPath: Channel.defaultThumbnailPath,
          visibility: Channel.visibility,
          approvedAt: Channel.approvedAt,
          deletedAt: Channel.deletedAt,
          websiteUrl: Channel.websiteUrl,
          facebookUrl: Channel.facebookUrl,
          instagramUrl: Channel.instagramUrl,
          xUrl: Channel.xUrl,
          youtubeUrl: Channel.youtubeUrl,
          tiktokUrl: Channel.tiktokUrl,
          linkedinUrl: Channel.linkedinUrl,
          threadsUrl: Channel.threadsUrl,
          applePodcastsUrl: Channel.applePodcastsUrl,
          spotifyUrl: Channel.spotifyUrl,
          rssUrl: Channel.rssUrl,
          fallbackThumbnailPath: fallbackThumbnailSq.thumbnailPath,
          subscriberCount: sql<number>`coalesce(${subscriberCountSq.cnt}, 0)::int`,
          isFollowing: isNotNull(isFollowingSq.channelId).mapWith(Boolean),
          uploadCount: sql<number>`coalesce(${uploadCountSq.cnt}, 0)::int`,
        })
        .from(Channel)
        .leftJoin(uploadCountSq, eq(Channel.id, uploadCountSq.channelId))
        .leftJoin(
          subscriberCountSq,
          eq(Channel.id, subscriberCountSq.channelId),
        )
        .leftJoin(isFollowingSq, eq(Channel.id, isFollowingSq.channelId))
        .leftJoin(
          fallbackThumbnailSq,
          eq(Channel.id, fallbackThumbnailSq.channelId),
        )
        .where(and(eq(Channel.slug, slug), isNull(Channel.deletedAt)))
        .limit(1);

      if (!channel) {
        moduleLogger.warn({ context: { slug } }, 'Channel not found');
        return null;
      }

      // UNLISTED channels are reachable by direct link (just not surfaced in
      // search/listings), so only PRIVATE/unapproved/deleted channels are
      // treated as not found. Return null rather than throwing so the route
      // loader renders the in-page "not found" UI instead of a 500.
      if (
        channel.visibility === 'PRIVATE' ||
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
        return null;
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

      const defaultThumbnailUrl =
        channel.defaultThumbnailPath || channel.fallbackThumbnailPath
          ? getPublicImageUrl(
              publicS3.getS3ProtocolUri(
                channel.defaultThumbnailPath ??
                  channel.fallbackThumbnailPath ??
                  '',
              ),
              { resize: { type: ResizeType.FILL, width: 1920, height: 1080 } },
            )
          : null;

      const { subscriberCount, isFollowing, uploadCount } = channel;

      // Is the channel currently broadcasting? (a started, not-yet-ended live
      // broadcast). Drives the channel-page live indicator + avatar badge.
      const liveBroadcastVisibilities =
        await getViewerLiveBroadcastVisibilities(channel.id, ctx);
      const liveBroadcast = await db.query.UploadRecord.findFirst({
        columns: { id: true },
        where: (t, { and, eq, inArray, isNull, isNotNull }) =>
          and(
            eq(t.channelId, channel.id),
            eq(t.isLiveBroadcast, true),
            isNotNull(t.liveStartedAt),
            isNull(t.liveEndedAt),
            inArray(t.visibility, liveBroadcastVisibilities),
            isNull(t.deletedAt),
          ),
      });

      return {
        id: OutgoingIdSchema.parse(channel.id),
        isLive: Boolean(liveBroadcast),
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
        uploadCount,
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
        channelRecord.visibility === 'PRIVATE' ||
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
        where: (t, { and, or, isNotNull, isNull, eq, lt, gt }) => {
          const base = and(
            isNotNull(t.transcodingFinishedAt),
            eq(t.visibility, 'PUBLIC'),
            isNull(t.deletedAt),
            eq(t.channelId, channelRecord.id),
          );
          if (!cursor) return base;
          const pipeIdx = cursor.indexOf('|');
          if (pipeIdx !== -1) {
            const cursorDate = new Date(cursor.slice(0, pipeIdx));
            const cursorId = cursor.slice(pipeIdx + 1);
            return and(
              base,
              or(
                lt(t.publishedAt, cursorDate),
                and(eq(t.publishedAt, cursorDate), gt(t.id, cursorId)),
              ),
            );
          }
          return and(base, lt(t.publishedAt, new Date(cursor)));
        },
        orderBy: (t, { desc, asc }) => [desc(t.publishedAt), asc(t.id)],
        limit: limit + 1, // Fetch one extra to determine if there are more
      });

      const hasMore = uploads.length > limit;
      const items = hasMore ? uploads.slice(0, limit) : uploads;
      const nextCursor = hasMore
        ? (() => {
            const last = items[items.length - 1];
            if (!last.publishedAt) return null;
            return `${last.publishedAt.toISOString()}|${last.id}`;
          })()
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
        channelRecord.visibility === 'PRIVATE' ||
        !channelRecord.approvedAt ||
        channelRecord.deletedAt
      ) {
        return [];
      }

      const visibleUploadWhere = and(
        eq(UploadRecord.visibility, 'PUBLIC'),
        isNotNull(UploadRecord.transcodingFinishedAt),
        isNull(UploadRecord.deletedAt),
      );

      const uploadCountSq = db
        .select({
          uploadListId: UploadListEntry.uploadListId,
          cnt: count().as('playlist_upload_cnt'),
        })
        .from(UploadListEntry)
        .innerJoin(
          UploadRecord,
          eq(UploadListEntry.uploadRecordId, UploadRecord.id),
        )
        .where(visibleUploadWhere)
        .groupBy(UploadListEntry.uploadListId)
        .as('playlist_upload_counts');

      const firstThumbnailSq = db
        .selectDistinctOn([UploadListEntry.uploadListId], {
          uploadListId: UploadListEntry.uploadListId,
          overrideThumbnailPath: UploadRecord.overrideThumbnailPath,
          defaultThumbnailPath: UploadRecord.defaultThumbnailPath,
        })
        .from(UploadListEntry)
        .innerJoin(
          UploadRecord,
          eq(UploadListEntry.uploadRecordId, UploadRecord.id),
        )
        .where(visibleUploadWhere)
        .orderBy(
          UploadListEntry.uploadListId,
          asc(UploadListEntry.rank),
          asc(UploadListEntry.createdAt),
        )
        .as('first_thumbnails');

      const playlists = await db
        .select({
          id: UploadList.id,
          title: UploadList.title,
          type: UploadList.type,
          createdAt: UploadList.createdAt,
          updatedAt: UploadList.updatedAt,
          uploadCount: sql<number>`coalesce(${uploadCountSq.cnt}, 0)::int`,
          overrideThumbnailPath: firstThumbnailSq.overrideThumbnailPath,
          defaultThumbnailPath: firstThumbnailSq.defaultThumbnailPath,
        })
        .from(UploadList)
        .leftJoin(uploadCountSq, eq(UploadList.id, uploadCountSq.uploadListId))
        .leftJoin(
          firstThumbnailSq,
          eq(UploadList.id, firstThumbnailSq.uploadListId),
        )
        .where(
          and(
            eq(UploadList.channelId, channelRecord.id),
            eq(UploadList.visibility, 'PUBLIC'),
          ),
        )
        .orderBy(desc(UploadList.createdAt));

      return playlists.map((playlist) => {
        const thumbnailUrl = resolveThumbnailUrl({
          overrideThumbnailPath: playlist.overrideThumbnailPath,
          defaultThumbnailPath: playlist.defaultThumbnailPath,
          channelDefaultThumbnailPath: channelRecord.defaultThumbnailPath,
          size: 'card',
        });

        return {
          id: OutgoingIdSchema.parse(playlist.id),
          title: playlist.title,
          type: playlist.type,
          createdAt: playlist.createdAt,
          updatedAt: playlist.updatedAt,
          uploadCount: playlist.uploadCount,
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
        channelRecord.visibility === 'PRIVATE' ||
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
        ...(search
          ? [ilike(Channel.name, `%${escapeLikePattern(search)}%`)]
          : []),
      ];

      const orderBy =
        sortBy === 'subscribers'
          ? [desc(sql`coalesce(${subscriberCountSq.cnt}, 0)`), asc(Channel.id)]
          : sortBy === 'name'
            ? [asc(Channel.name), asc(Channel.id)]
            : [desc(Channel.createdAt), asc(Channel.id)];

      const channels = await db
        .select({
          id: Channel.id,
          name: Channel.name,
          slug: Channel.slug,
          description: Channel.description,
          avatarPath: Channel.avatarPath,
          createdAt: Channel.createdAt,
          subscriberCount: sql<number>`coalesce(${subscriberCountSq.cnt}, 0)::int`,
        })
        .from(Channel)
        .leftJoin(
          subscriberCountSq,
          eq(Channel.id, subscriberCountSq.channelId),
        )
        .where(and(...whereConditions))
        .orderBy(...orderBy)
        .limit(limit + 1)
        .offset(offset);

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
            subscriberCount: channel.subscriberCount,
          };
        }),
        nextCursor,
      };
    }),

  // Resolve a channel slug to its current in-progress (or most recent) live
  // broadcast. Used by the /<slug>/live and /channel/<slug>/live redirects.
  // Prefers a broadcast that is still live (no liveEndedAt), otherwise the most
  // recent one. Returns null if the channel has never broadcast.
  getLatestLiveStream: publicProcedure
    .input(channelQuerySchema)
    .query(async ({ input, ctx }) => {
      const { slug } = input;

      // Only resolve for publicly viewable channels (approved, not private) so
      // this public endpoint can't be used to probe private/unapproved streams.
      const channel = await db.query.Channel.findFirst({
        columns: { id: true },
        where: (t, { and, eq, isNull, ne, isNotNull }) =>
          and(
            eq(t.slug, slug),
            isNull(t.deletedAt),
            ne(t.visibility, 'PRIVATE'),
            isNotNull(t.approvedAt),
          ),
      });
      if (!channel) {
        return null;
      }

      // PRIVATE broadcasts resolve only for site admins or channel members.
      // UNLISTED remains excluded because /<slug>/live is guessable.
      const liveBroadcastVisibilities =
        await getViewerLiveBroadcastVisibilities(channel.id, ctx);
      const broadcast = await db.query.UploadRecord.findFirst({
        columns: { id: true },
        where: (t, { and, eq, inArray, isNull, isNotNull }) =>
          and(
            eq(t.channelId, channel.id),
            eq(t.isLiveBroadcast, true),
            isNotNull(t.liveStartedAt),
            inArray(t.visibility, liveBroadcastVisibilities),
            isNull(t.deletedAt),
          ),
        orderBy: (t, { desc }) => [
          desc(sql`${t.liveEndedAt} is null`),
          desc(t.liveStartedAt),
        ],
      });
      if (!broadcast) {
        return null;
      }

      return { mediaId: OutgoingIdSchema.parse(broadcast.id) };
    }),
};
