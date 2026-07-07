import { db } from '@letschurch/db';
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
      const list = await db.query.UploadList.findFirst({
        where: (t, { eq }) => eq(t.id, listId),
        columns: {
          id: true,
          title: true,
          type: true,
        },
        with: {
          channel: {
            columns: {
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
          },
        },
      });

      // Return null (rather than throwing) for anything the caller can't view
      // so consumers — e.g. the media page's series sidebar — render an empty
      // state instead of crashing SSR with a 500. Throwing here propagates
      // through useSuspenseQuery and takes the whole page down.
      if (!list) {
        moduleLogger.warn({ context: { listId } }, 'List not found');
        return null;
      }

      // Validate list type
      if (list.type !== 'PLAYLIST' && list.type !== 'SERIES') {
        moduleLogger.warn(
          { context: { listId, type: list.type } },
          'Invalid list type',
        );
        return null;
      }

      if (!list.channel) {
        moduleLogger.warn({ context: { listId } }, 'List has no channel');
        return null;
      }

      // Mirror getMediaById's access model: UNLISTED channels stay reachable by
      // direct link (their media already is), so only gate PRIVATE/unapproved/
      // deleted channels here.
      if (
        list.channel.visibility === 'PRIVATE' ||
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
        return null;
      }

      // Fetch all list entries
      const entries = await db.query.UploadListEntry.findMany({
        where: (t, { eq }) => eq(t.uploadListId, listId),
        columns: {},
        with: {
          upload: {
            columns: {
              id: true,
              title: true,
              publishedAt: true,
              lengthSeconds: true,
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
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
                  defaultThumbnailPath: true,
                },
              },
            },
          },
        },
        orderBy: (t, { asc }) => [asc(t.rank), asc(t.createdAt)],
      });

      // Filter to viewable, transcoded, non-deleted uploads. Mirror
      // getMediaById's access model: UNLISTED uploads stay reachable by direct
      // link, so only PRIVATE is gated. Without this, an UNLISTED media item
      // reached directly would render with an empty series sidebar because its
      // own entry (and any sibling UNLISTED entries) got filtered out.
      const filteredEntries = entries.filter(
        (e) =>
          e.upload.visibility !== 'PRIVATE' &&
          e.upload.transcodingFinishedAt !== null &&
          e.upload.deletedAt === null,
      );

      const items = filteredEntries.map((entry) => {
        const upload = entry.upload;
        const {
          defaultThumbnailPath,
          overrideThumbnailPath,
          channel,
          visibility: _visibility,
          transcodingFinishedAt: _transcodingFinishedAt,
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
