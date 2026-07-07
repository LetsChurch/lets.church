import { db, SavedMedia } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarXs2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import {
  canViewMedia,
  canViewMediaById,
  getMemberChannelIds,
} from '@/util/media-visibility';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';

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
      const existingSave = await db.query.SavedMedia.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.appUserId, userId), eq(t.uploadRecordId, mediaId)),
      });

      if (existingSave) {
        // User is clicking save again - remove it (toggle off)
        await db
          .delete(SavedMedia)
          .where(
            and(
              eq(SavedMedia.appUserId, userId),
              eq(SavedMedia.uploadRecordId, mediaId),
            ),
          );

        moduleLogger.info('Media unsaved');

        return { saved: false };
      } else {
        // Don't let a caller plant a private/unapproved/deleted upload into
        // their saved list (and then read its metadata back through
        // getSavedMedia) by passing an id they can't actually view.
        if (!(await canViewMediaById(mediaId, ctx))) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Media not found',
          });
        }

        // User is saving for the first time
        await db.insert(SavedMedia).values({
          appUserId: userId,
          uploadRecordId: mediaId,
        });

        moduleLogger.info('Media saved');

        return { saved: true };
      }
    }),

  // isSaved: authProcedure
  //   .input(z.object({ mediaId: z.uuid() }))
  //   .query(async ({ input, ctx }) => {
  //     const saved = await db.query.SavedMedia.findFirst({
  //       where: (t, { and, eq }) =>
  //         and(
  //           eq(t.appUserId, ctx.session.appUserId),
  //           eq(t.uploadRecordId, input.mediaId),
  //         ),
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

      const memberChannelIds = await getMemberChannelIds(ctx.session.appUserId);

      const savedMedia = await db.query.SavedMedia.findMany({
        columns: {
          createdAt: true,
        },
        with: {
          uploadRecord: {
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
        },
        where: (t, { and, eq, lt }) =>
          and(
            eq(t.appUserId, ctx.session.appUserId),
            ...(cursor ? [lt(t.createdAt, new Date(cursor))] : []),
          ),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
        limit: limit + 1, // Fetch one extra to determine if there are more
      });

      const hasMore = savedMedia.length > limit;
      const items = hasMore ? savedMedia.slice(0, limit) : savedMedia;
      const nextCursor = hasMore
        ? items[items.length - 1].createdAt.toISOString()
        : null;

      const uploadsWithThumbnails = items
        .filter(({ uploadRecord }) =>
          canViewMedia({
            upload: uploadRecord,
            channelId: uploadRecord.channelId,
            channel: uploadRecord.channel,
            isSiteAdmin: Boolean(ctx.isSiteAdmin),
            memberChannelIds,
          }),
        )
        .map(({ uploadRecord }) => {
          const {
            defaultThumbnailPath,
            overrideThumbnailPath,
            channel,
            // Drop visibility/internal fields from the response shape.
            visibility: _visibility,
            deletedAt: _deletedAt,
            channelId: _channelId,
            ...uploadRest
          } = uploadRecord;

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
            channel: {
              ...channelRest,
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

      const BATCH_SIZE = 100;

      const memberChannelIds = await getMemberChannelIds(ctx.session.appUserId);

      // Helper typed so dedupedHistory can infer its element type
      const fetchBatch = (cur: string | null | undefined) =>
        db.query.UploadView.findMany({
          columns: {
            createdAt: true,
            uploadRecordId: true,
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
          where: (t, { and, eq, lt }) =>
            and(
              eq(t.appUserId, ctx.session.appUserId),
              ...(cur ? [lt(t.createdAt, new Date(cur))] : []),
            ),
          orderBy: (t, { desc }) => [desc(t.createdAt)],
          limit: BATCH_SIZE,
        });

      type HistoryItem = Awaited<ReturnType<typeof fetchBatch>>[number];

      const seen = new Set<string>();
      const dedupedHistory: HistoryItem[] = [];
      let batchCursor = cursor;

      // Iteratively fetch batches until we have limit+1 unique items or exhaust rows
      outer: while (true) {
        const batch = await fetchBatch(batchCursor);

        for (const item of batch) {
          if (seen.has(item.uploadRecordId)) {
            continue;
          }
          seen.add(item.uploadRecordId);
          // Skip history rows for media the user can no longer view (made
          // private/unapproved/deleted after the view was recorded, or planted
          // via the public view-recording endpoints).
          if (
            !canViewMedia({
              upload: item.upload,
              channelId: item.upload.channelId,
              channel: item.upload.channel,
              isSiteAdmin: Boolean(ctx.isSiteAdmin),
              memberChannelIds,
            })
          ) {
            continue;
          }
          dedupedHistory.push(item);
          if (dedupedHistory.length > limit) break outer;
        }

        if (batch.length < BATCH_SIZE) break;
        batchCursor = batch[batch.length - 1]?.createdAt.toISOString();
      }

      const hasMore = dedupedHistory.length > limit;
      const items = hasMore ? dedupedHistory.slice(0, limit) : dedupedHistory;
      const nextCursor = hasMore
        ? items[items.length - 1]?.createdAt.toISOString()
        : null;

      const uploadsWithThumbnails = items.map(
        ({ upload, UploadViewSecond }) => {
          const {
            defaultThumbnailPath,
            overrideThumbnailPath,
            channel,
            visibility: _visibility,
            deletedAt: _deletedAt,
            channelId: _channelId,
            ...uploadRest
          } = upload;

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
              ...channelRest,
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
