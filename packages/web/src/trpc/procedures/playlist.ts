import { Channel, db, UploadListEntry, UploadRecord } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import {
  and,
  asc,
  count,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
} from 'drizzle-orm';
import { z } from 'zod';

import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarMd2x, appAvatarXs2x } from '@/util/avatar-sizes';
import {
  encodeListMediaCursor,
  listMediaCursorSchema,
} from '@/util/list-pagination';
import {
  canShowUploadInList,
  getListUploadVisibilities,
} from '@/util/list-visibility-rules';
import logger from '@/util/logger';
import { isChannelRoutable } from '@/util/media-visibility';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';

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
  cursor: listMediaCursorSchema.nullable().optional(),
});

export const playlistProcedures = {
  getAllPlaylistItems: publicProcedure
    .input(playlistQuerySchema)
    .query(async ({ input }) => {
      const { playlistId } = input;

      moduleLogger.info(
        { context: { playlistId } },
        'Fetching all playlist items',
      );

      // First verify the playlist and its channel are directly routable.
      const playlist = await db.query.UploadList.findFirst({
        where: (t, { eq }) => eq(t.id, playlistId),
        columns: {
          id: true,
          title: true,
          type: true,
          visibility: true,
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

      if (!playlist || playlist.type !== 'PLAYLIST') {
        moduleLogger.warn({ context: { playlistId } }, 'Playlist not found');
        throw new Error('Playlist not found');
      }

      if (playlist.channel) {
        if (!isChannelRoutable(playlist.channel)) {
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
      }

      // Fetch all playlist entries
      const entries = await db.query.UploadListEntry.findMany({
        where: (t, { eq }) => eq(t.uploadListId, playlistId),
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

      // An UNLISTED playlist is itself the direct-link capability for its
      // UNLISTED uploads. PUBLIC playlists continue to expose only PUBLIC
      // uploads, and PRIVATE uploads never inherit access from a playlist.
      const filteredEntries = entries.filter(
        (e) =>
          canShowUploadInList(playlist.visibility, e.upload.visibility) &&
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
        title: playlist.title,
        items,
      };
    }),

  getPublicPlaylist: publicProcedure
    .input(playlistQuerySchema)
    .query(async ({ input }) => {
      const { playlistId } = input;

      moduleLogger.info(
        { context: { playlistId } },
        'Fetching public playlist',
      );

      const playlist = await db.query.UploadList.findFirst({
        where: (t, { eq }) => eq(t.id, playlistId),
        columns: {
          id: true,
          title: true,
          type: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
        },
        with: {
          author: {
            columns: {
              id: true,
              username: true,
              avatarPath: true,
            },
          },
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

      // UNLISTED channels remain reachable by direct link, matching media.
      if (playlist.channel) {
        if (!isChannelRoutable(playlist.channel)) {
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
      }

      const uploadCountResult = await db
        .select({ count: count() })
        .from(UploadListEntry)
        .innerJoin(
          UploadRecord,
          eq(UploadListEntry.uploadRecordId, UploadRecord.id),
        )
        .where(
          and(
            eq(UploadListEntry.uploadListId, playlistId),
            inArray(
              UploadRecord.visibility,
              getListUploadVisibilities(playlist.visibility),
            ),
            isNotNull(UploadRecord.transcodingFinishedAt),
            isNull(UploadRecord.deletedAt),
          ),
        )
        .then((r) => r[0]);

      const uploadCount = Number(uploadCountResult?.count ?? 0);

      const authorAvatarUrl = playlist.author.avatarPath
        ? getPublicImageUrl(
            publicS3.getS3ProtocolUri(playlist.author.avatarPath),
            {
              resize: appAvatarMd2x,
            },
          )
        : null;

      const channelAvatarUrl = playlist.channel?.avatarPath
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
        visibility: playlist.visibility,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
        author: {
          id: OutgoingIdSchema.parse(playlist.author.id),
          username: playlist.author.username,
          avatarUrl: authorAvatarUrl,
        },
        channel: playlist.channel
          ? {
              id: OutgoingIdSchema.parse(playlist.channel.id),
              name: playlist.channel.name,
              slug: playlist.channel.slug,
              avatarUrl: channelAvatarUrl,
            }
          : null,
        uploadCount,
      };
    }),

  getPublicPlaylistFirstThumbnail: publicProcedure
    .input(playlistQuerySchema)
    .query(async ({ input }) => {
      const { playlistId } = input;

      moduleLogger.info(
        { context: { playlistId } },
        'Fetching first playlist thumbnail',
      );

      // Apply the same visibility checks as getPublicPlaylist before resolving a
      // thumbnail, so a private/unapproved channel's playlist id can't leak a
      // thumbnail URL through this endpoint.
      const playlist = await db.query.UploadList.findFirst({
        where: (t, { eq }) => eq(t.id, playlistId),
        columns: { id: true, type: true, visibility: true },
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

      if (!playlist || playlist.type !== 'PLAYLIST') {
        return null;
      }

      if (playlist.channel && !isChannelRoutable(playlist.channel)) {
        return null;
      }

      // Resolve the first upload visible through this list's own visibility.
      const firstEntry = await db
        .select({
          overrideThumbnailPath: UploadRecord.overrideThumbnailPath,
          defaultThumbnailPath: UploadRecord.defaultThumbnailPath,
          channelDefaultThumbnailPath: Channel.defaultThumbnailPath,
        })
        .from(UploadListEntry)
        .innerJoin(
          UploadRecord,
          eq(UploadListEntry.uploadRecordId, UploadRecord.id),
        )
        .leftJoin(Channel, eq(UploadRecord.channelId, Channel.id))
        .where(
          and(
            eq(UploadListEntry.uploadListId, playlistId),
            inArray(
              UploadRecord.visibility,
              getListUploadVisibilities(playlist.visibility),
            ),
            isNotNull(UploadRecord.transcodingFinishedAt),
            isNull(UploadRecord.deletedAt),
          ),
        )
        .orderBy(asc(UploadListEntry.rank), asc(UploadListEntry.createdAt))
        .limit(1)
        .then((r) => r[0]);

      if (!firstEntry) {
        return null;
      }

      return resolveThumbnailUrl({
        overrideThumbnailPath: firstEntry.overrideThumbnailPath,
        defaultThumbnailPath: firstEntry.defaultThumbnailPath,
        channelDefaultThumbnailPath: firstEntry.channelDefaultThumbnailPath,
        size: 'featured',
      });
    }),

  getPublicPlaylistMedia: publicProcedure
    .input(playlistMediaQuerySchema)
    .query(async ({ input }) => {
      const { playlistId, limit, cursor } = input;

      moduleLogger.info(
        { context: { playlistId, limit, cursor } },
        'Fetching public playlist media',
      );

      // First verify the playlist and its channel are directly routable.
      const playlist = await db.query.UploadList.findFirst({
        where: (t, { eq }) => eq(t.id, playlistId),
        columns: {
          id: true,
          type: true,
          visibility: true,
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

      if (!playlist || playlist.type !== 'PLAYLIST') {
        moduleLogger.warn({ context: { playlistId } }, 'Playlist not found');
        throw new Error('Playlist not found');
      }

      if (playlist.channel) {
        if (!isChannelRoutable(playlist.channel)) {
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
      }

      // Filter before pagination so hidden entries cannot consume the page
      // limit and make later visible uploads unreachable.
      const entries = await db.query.UploadListEntry.findMany({
        where: (t, operators) => {
          const afterCursor = cursor
            ? cursor.rank === null
              ? operators.and(
                  operators.isNull(t.rank),
                  operators.or(
                    operators.gt(t.createdAt, cursor.createdAt),
                    operators.and(
                      operators.eq(t.createdAt, cursor.createdAt),
                      operators.gt(t.uploadRecordId, cursor.uploadRecordId),
                    ),
                  ),
                )
              : operators.or(
                  operators.gt(t.rank, cursor.rank),
                  operators.isNull(t.rank),
                  operators.and(
                    operators.eq(t.rank, cursor.rank),
                    operators.or(
                      operators.gt(t.createdAt, cursor.createdAt),
                      operators.and(
                        operators.eq(t.createdAt, cursor.createdAt),
                        operators.gt(t.uploadRecordId, cursor.uploadRecordId),
                      ),
                    ),
                  ),
                )
            : undefined;

          return operators.and(
            operators.eq(t.uploadListId, playlistId),
            afterCursor,
            exists(
              db
                .select({ id: UploadRecord.id })
                .from(UploadRecord)
                .where(
                  and(
                    eq(UploadRecord.id, t.uploadRecordId),
                    inArray(
                      UploadRecord.visibility,
                      getListUploadVisibilities(playlist.visibility),
                    ),
                    isNotNull(UploadRecord.transcodingFinishedAt),
                    isNull(UploadRecord.deletedAt),
                  ),
                ),
            ),
          );
        },
        columns: {
          createdAt: true,
          rank: true,
          uploadRecordId: true,
        },
        with: {
          upload: {
            columns: {
              id: true,
              title: true,
              description: true,
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
        orderBy: (t, { asc }) => [
          asc(t.rank),
          asc(t.createdAt),
          asc(t.uploadRecordId),
        ],
        limit: limit + 1, // Fetch one extra to determine if there are more
      });

      const hasMore = entries.length > limit;
      const items = hasMore ? entries.slice(0, limit) : entries;
      const lastItem = items.at(-1);
      const nextCursor =
        hasMore && lastItem
          ? encodeListMediaCursor({
              rank: lastItem.rank,
              createdAt: lastItem.createdAt,
              uploadRecordId: lastItem.uploadRecordId,
            })
          : null;

      const uploadsWithThumbnails = items.map((entry) => {
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
