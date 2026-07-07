import { Channel, ChannelSubscription, db, UploadRecord } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarSm2x, appAvatarXs2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import {
  canViewMedia,
  getMemberChannelIds,
  isChannelRoutable,
} from '@/util/media-visibility';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';

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
    moduleLogger.info(
      { appUserId: ctx.session.appUserId },
      'Fetching followed channels',
    );

    const memberChannelIds = await getMemberChannelIds(ctx.session.appUserId);

    const subscriptions = await db.query.ChannelSubscription.findMany({
      columns: {},
      with: {
        channel: {
          columns: {
            id: true,
            name: true,
            slug: true,
            avatarPath: true,
            visibility: true,
            approvedAt: true,
            deletedAt: true,
          },
        },
      },
      where: (t, { eq }) => eq(t.appUserId, ctx.session.appUserId),
    });

    const channelsWithAvatars = subscriptions
      // Only return channels the user can actually see: public/approved, or a
      // private channel they are a member of. A subscription row alone (which
      // could have been created for a private channel id) must not expose
      // channel metadata.
      .filter(
        ({ channel }) =>
          isChannelRoutable(channel) || memberChannelIds.has(channel.id),
      )
      .map(({ channel }) => {
        const {
          visibility: _visibility,
          approvedAt: _approvedAt,
          deletedAt: _deletedAt,
          ...channelRest
        } = channel;

        const avatarUrl = channel.avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
              resize: appAvatarSm2x,
            })
          : null;

        return {
          ...channelRest,
          id: OutgoingIdSchema.parse(channel.id),
          avatarUrl,
        };
      });

    return channelsWithAvatars;
  }),

  getSubscriptionUploads: authProcedure
    .input(homeUploadsQuerySchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info(
        { appUserId: ctx.session.appUserId, context: { limit: input.limit } },
        'Fetching subscription uploads',
      );

      // First get followed channel IDs
      const subscriptions = await db.query.ChannelSubscription.findMany({
        columns: { channelId: true },
        where: (t, { eq }) => eq(t.appUserId, ctx.session.appUserId),
      });

      const followedChannelIds = subscriptions.map((s) => s.channelId);

      if (followedChannelIds.length === 0) {
        return [];
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
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
          },
        },
        where: (t, { and, isNotNull, isNull, eq, inArray }) =>
          and(
            isNotNull(t.transcodingFinishedAt),
            eq(t.visibility, 'PUBLIC'),
            isNull(t.deletedAt),
            inArray(t.channelId, followedChannelIds),
          ),
        orderBy: (t, { desc }) => [desc(t.publishedAt)],
        limit: input.limit * 5,
      });

      // Filter uploads where channel is public, approved, and not deleted
      const filteredUploads = uploads
        .filter(
          (u) =>
            u.channel.visibility === 'PUBLIC' &&
            u.channel.approvedAt !== null &&
            u.channel.deletedAt === null,
        )
        .slice(0, input.limit);

      const uploadsWithThumbnails = filteredUploads.map((upload) => {
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

      return uploadsWithThumbnails;
    }),

  getTrendingUploads: publicProcedure
    .input(homeUploadsQuerySchema)
    .query(async ({ input }) => {
      moduleLogger.info(
        { context: { limit: input.limit, cursor: input.cursor } },
        'Fetching trending uploads',
      );

      const rows = await db
        .select({
          id: UploadRecord.id,
          title: UploadRecord.title,
          description: UploadRecord.description,
          createdAt: UploadRecord.createdAt,
          publishedAt: UploadRecord.publishedAt,
          lengthSeconds: UploadRecord.lengthSeconds,
          score: UploadRecord.score,
          defaultThumbnailPath: UploadRecord.defaultThumbnailPath,
          overrideThumbnailPath: UploadRecord.overrideThumbnailPath,
          channelId: Channel.id,
          channelName: Channel.name,
          channelSlug: Channel.slug,
          channelAvatarPath: Channel.avatarPath,
          channelDefaultThumbnailPath: Channel.defaultThumbnailPath,
        })
        .from(UploadRecord)
        .innerJoin(Channel, eq(UploadRecord.channelId, Channel.id))
        .where(
          and(
            isNotNull(UploadRecord.transcodingFinishedAt),
            eq(UploadRecord.visibility, 'PUBLIC'),
            isNull(UploadRecord.deletedAt),
            eq(Channel.visibility, 'PUBLIC'),
            isNotNull(Channel.approvedAt),
            isNull(Channel.deletedAt),
          ),
        )
        .orderBy(desc(UploadRecord.score))
        .offset(input.cursor ?? 0)
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const uploads = hasMore ? rows.slice(0, input.limit) : rows;

      const uploadsWithThumbnails = uploads.map((row) => {
        const {
          channelId,
          channelName,
          channelSlug,
          channelAvatarPath,
          channelDefaultThumbnailPath,
          defaultThumbnailPath,
          overrideThumbnailPath,
          ...uploadRest
        } = row;

        const thumbnailUrl = resolveThumbnailUrl({
          overrideThumbnailPath,
          defaultThumbnailPath,
          channelDefaultThumbnailPath,
          size: 'card',
        });

        const channelAvatarUrl = channelAvatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(channelAvatarPath), {
              resize: appAvatarXs2x,
            })
          : null;

        return {
          ...uploadRest,
          id: OutgoingIdSchema.parse(uploadRest.id),
          thumbnailUrl,
          channel: {
            id: OutgoingIdSchema.parse(channelId),
            name: channelName,
            slug: channelSlug,
            avatarUrl: channelAvatarUrl,
          },
        };
      });

      const nextCursor = hasMore
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

      moduleLogger.info(
        { appUserId, context: { limit: input.limit } },
        'Fetching suggested channels',
      );

      // If user is authenticated, get their subscribed channel IDs first
      let subscribedChannelIds: string[] = [];
      if (appUserId) {
        const subscriptions = await db.query.ChannelSubscription.findMany({
          columns: { channelId: true },
          where: (t, { eq }) => eq(t.appUserId, appUserId),
        });
        subscribedChannelIds = subscriptions.map((s) => s.channelId);
      }

      // Use SQL-style query to order by subscriber count
      const subscriberCountSq = db
        .select({
          channelId: ChannelSubscription.channelId,
          cnt: count().as('cnt'),
        })
        .from(ChannelSubscription)
        .groupBy(ChannelSubscription.channelId)
        .as('subscriber_counts');

      const channelsQuery = db
        .select({
          id: Channel.id,
          name: Channel.name,
          slug: Channel.slug,
          description: Channel.description,
          avatarPath: Channel.avatarPath,
          followerCount: sql<number>`coalesce(${subscriberCountSq.cnt}, 0)::int`,
        })
        .from(Channel)
        .leftJoin(
          subscriberCountSq,
          eq(Channel.id, subscriberCountSq.channelId),
        )
        .where(
          and(
            eq(Channel.visibility, 'PUBLIC'),
            isNotNull(Channel.approvedAt),
            isNull(Channel.deletedAt),
            ...(subscribedChannelIds.length > 0
              ? [
                  sql`${Channel.id} NOT IN (${sql.join(
                    subscribedChannelIds.map((id) => sql`${id}`),
                    sql`, `,
                  )})`,
                ]
              : []),
          ),
        )
        .orderBy(desc(sql`coalesce(${subscriberCountSq.cnt}, 0)`))
        .limit(input.limit);

      const channels = await channelsQuery;

      const channelsWithAvatars = channels.map((channel) => {
        const avatarUrl = channel.avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
              resize: appAvatarXs2x,
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

  followChannel: authProcedure
    .input(followChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        { appUserId: ctx.session.appUserId, channelId: input.channelId },
        'Following channel',
      );

      try {
        // Only allow following channels the user can see: public/approved, or a
        // private channel they belong to. Otherwise a user who guesses a private
        // channel id could subscribe and then read its metadata back through
        // getFollowedChannels.
        const channel = await db.query.Channel.findFirst({
          columns: {
            id: true,
            visibility: true,
            approvedAt: true,
            deletedAt: true,
          },
          where: (t, { eq }) => eq(t.id, input.channelId),
        });

        if (!channel || channel.deletedAt) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Channel not found',
          });
        }

        if (!isChannelRoutable(channel)) {
          const membership = await db.query.ChannelMembership.findFirst({
            columns: { appUserId: true },
            where: (t, { and, eq }) =>
              and(
                eq(t.channelId, input.channelId),
                eq(t.appUserId, ctx.session.appUserId),
              ),
          });
          if (!membership) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Channel not found',
            });
          }
        }

        await db.insert(ChannelSubscription).values({
          appUserId: ctx.session.appUserId,
          channelId: input.channelId,
        });

        moduleLogger.info(
          { appUserId: ctx.session.appUserId, channelId: input.channelId },
          'Channel followed successfully',
        );

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            channelId: input.channelId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to follow channel',
        );

        throw new Error('Failed to follow channel');
      }
    }),

  unfollowChannel: authProcedure
    .input(unfollowChannelSchema)
    .mutation(async ({ ctx, input }) => {
      moduleLogger.info(
        { appUserId: ctx.session.appUserId, channelId: input.channelId },
        'Unfollowing channel',
      );

      try {
        const subscription = await db.query.ChannelSubscription.findFirst({
          columns: { appUserId: true },
          where: (t, { and, eq }) =>
            and(
              eq(t.appUserId, ctx.session.appUserId),
              eq(t.channelId, input.channelId),
            ),
        });

        if (!subscription) {
          moduleLogger.warn(
            { appUserId: ctx.session.appUserId, channelId: input.channelId },
            'Subscription not found',
          );
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Subscription not found',
          });
        }

        await db
          .delete(ChannelSubscription)
          .where(
            and(
              eq(ChannelSubscription.appUserId, ctx.session.appUserId),
              eq(ChannelSubscription.channelId, input.channelId),
            ),
          );

        moduleLogger.info(
          { appUserId: ctx.session.appUserId, channelId: input.channelId },
          'Channel unfollowed successfully',
        );

        return { success: true };
      } catch (error) {
        moduleLogger.error(
          {
            appUserId: ctx.session.appUserId,
            channelId: input.channelId,
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to unfollow channel',
        );

        throw new Error('Failed to unfollow channel');
      }
    }),

  getInProgressUploads: authProcedure
    .input(inProgressUploadsQuerySchema)
    .query(async ({ ctx, input }) => {
      moduleLogger.info(
        { appUserId: ctx.session.appUserId, context: { limit: input.limit } },
        'Fetching in-progress uploads',
      );

      const memberChannelIds = await getMemberChannelIds(ctx.session.appUserId);

      // Get user's upload views with their most recent viewed seconds
      const views = await db.query.UploadView.findMany({
        columns: {
          uploadRecordId: true,
          createdAt: true,
        },
        with: {
          upload: {
            columns: {
              id: true,
              title: true,
              description: true,
              createdAt: true,
              publishedAt: true,
              lengthSeconds: true,
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
              visibility: true,
              deletedAt: true,
              channelId: true,
            },
            with: {
              channel: {
                columns: {
                  id: true,
                  name: true,
                  slug: true,
                  avatarPath: true,
                  defaultThumbnailPath: true,
                  visibility: true,
                  approvedAt: true,
                  deletedAt: true,
                },
              },
            },
          },
          UploadViewSecond: {
            columns: {
              second: true,
            },
            orderBy: (t, { desc }) => [desc(t.second)],
            limit: 1,
          },
        },
        where: (t, { eq }) => eq(t.appUserId, ctx.session.appUserId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: input.limit * 3, // Fetch more since we'll filter
      });

      // Deduplicate by uploadRecordId (only show each video once - most recent view)
      const seen = new Set<string>();
      const dedupedViews = views.filter((view) => {
        if (seen.has(view.uploadRecordId)) return false;
        seen.add(view.uploadRecordId);
        return true;
      });

      // Calculate progress and filter to 1-95%
      const uploadsWithProgress = dedupedViews
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

          // Skip media the user can no longer view (made private/unapproved/
          // deleted, or seeded via the public view-recording endpoints).
          if (
            !canViewMedia({
              upload: view.upload,
              channelId: view.upload.channelId,
              channel: view.upload.channel,
              isSiteAdmin: Boolean(ctx.isSiteAdmin),
              memberChannelIds,
            })
          ) {
            return null;
          }

          const {
            defaultThumbnailPath,
            overrideThumbnailPath,
            channel,
            visibility: _visibility,
            deletedAt: _deletedAt,
            channelId: _channelId,
            ...uploadRest
          } = view.upload;

          const {
            visibility: _channelVisibility,
            approvedAt: _channelApprovedAt,
            deletedAt: _channelDeletedAt,
            ...channelRest
          } = channel;

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
            progress,
            channel: {
              ...channelRest,
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

    const featuredUploads = await db.query.FeaturedUpload.findMany({
      columns: {},
      with: {
        uploadRecord: {
          columns: {
            id: true,
            title: true,
            description: true,
            lengthSeconds: true,
            defaultThumbnailPath: true,
            overrideThumbnailPath: true,
            defaultThumbnailBlurhash: true,
            overrideThumbnailBlurhash: true,
            visibility: true,
            transcodingFinishedAt: true,
            deletedAt: true,
          },
          with: {
            channel: {
              columns: {
                id: true,
                name: true,
                slug: true,
                avatarPath: true,
                avatarBlurhash: true,
                defaultThumbnailPath: true,
                visibility: true,
                approvedAt: true,
                deletedAt: true,
              },
            },
          },
        },
      },
      orderBy: (t, { asc }) => [asc(t.rank)],
    });

    // Filter to only those where the upload and channel meet visibility conditions
    const filteredUploads = featuredUploads.filter(
      ({ uploadRecord }) =>
        uploadRecord.visibility === 'PUBLIC' &&
        uploadRecord.transcodingFinishedAt !== null &&
        uploadRecord.deletedAt === null &&
        uploadRecord.channel.visibility === 'PUBLIC' &&
        uploadRecord.channel.approvedAt !== null &&
        uploadRecord.channel.deletedAt === null,
    );

    const uploadsWithUrls = filteredUploads.map(({ uploadRecord }) => {
      const thumbnailBlurhash =
        uploadRecord.overrideThumbnailBlurhash ??
        uploadRecord.defaultThumbnailBlurhash;

      const thumbnailUrl = resolveThumbnailUrl({
        overrideThumbnailPath: uploadRecord.overrideThumbnailPath,
        defaultThumbnailPath: uploadRecord.defaultThumbnailPath,
        channelDefaultThumbnailPath: uploadRecord.channel.defaultThumbnailPath,
        size: 'featured',
      });

      const channelAvatarUrl = uploadRecord.channel.avatarPath
        ? getPublicImageUrl(
            publicS3.getS3ProtocolUri(uploadRecord.channel.avatarPath),
            {
              resize: appAvatarSm2x,
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
