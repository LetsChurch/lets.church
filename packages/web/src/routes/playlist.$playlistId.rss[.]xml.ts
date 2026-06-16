import { db } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { createFileRoute } from '@tanstack/react-router';
import { Feed } from 'feed';
import { IncomingIdSchema, idTranslator } from '@/schemas/common';
import { rssFeedIcon } from '@/util/image-sizes';
import logger from '@/util/logger';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';

const moduleLogger = logger.child({
  module: 'routes/playlist/$playlistId/rss.xml',
});

export const Route = createFileRoute('/playlist/$playlistId/rss.xml')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { playlistId } = params;

        moduleLogger.info('Generating playlist RSS feed');

        try {
          const siteUrl = process.env.PUBLIC_URL || 'https://lets.church';
          const parsedPlaylistId = IncomingIdSchema.parse(playlistId);

          // Fetch playlist
          const playlist = await db.query.UploadList.findFirst({
            where: (t, { eq }) => eq(t.id, parsedPlaylistId),
            columns: {
              id: true,
              title: true,
              type: true,
            },
            with: {
              author: {
                columns: { username: true },
              },
              channel: {
                columns: {
                  name: true,
                  slug: true,
                  defaultThumbnailPath: true,
                  visibility: true,
                  approvedAt: true,
                  deletedAt: true,
                },
              },
            },
          });

          if (!playlist) {
            moduleLogger.warn('Playlist not found');
            return new Response('Playlist not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          if (playlist.type !== 'PLAYLIST') {
            moduleLogger.warn(
              {
                context: { type: playlist.type },
              },
              'Not a playlist',
            );
            return new Response('Playlist not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          if (!playlist.channel) {
            moduleLogger.warn('Playlist has no channel');
            return new Response('Playlist not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          if (
            playlist.channel.visibility !== 'PUBLIC' ||
            !playlist.channel.approvedAt ||
            playlist.channel.deletedAt
          ) {
            moduleLogger.warn(
              {
                context: {
                  visibility: playlist.channel.visibility,
                  approved: Boolean(playlist.channel.approvedAt),
                },
              },
              'Channel not accessible',
            );
            return new Response('Playlist not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          const playlistUrl = `${siteUrl}/playlist/${playlistId}`;
          const channelUrl = `${siteUrl}/channel/${playlist.channel.slug}`;

          const playlistImageUrl = playlist.channel.defaultThumbnailPath
            ? getPublicImageUrl(
                publicS3.getS3ProtocolUri(
                  playlist.channel.defaultThumbnailPath,
                ),
                { resize: rssFeedIcon },
              )
            : null;

          const feed = new Feed({
            title: `${playlist.title} - ${playlist.channel.name} on Let's Church`,
            description: `Playlist by ${playlist.author.username} on ${playlist.channel.name}`,
            id: `${siteUrl}/playlist/${playlistId}/rss.xml`,
            link: playlistUrl,
            language: 'en',
            favicon: `${siteUrl}/favicon.svg`,
            copyright: `All rights reserved ${new Date().getFullYear()}, ${playlist.channel.name}`,
            feedLinks: {
              rss: `${siteUrl}/playlist/${playlistId}/rss.xml`,
            },
            ...(playlistImageUrl && {
              image: playlistImageUrl,
            }),
          });

          // Fetch playlist entries ordered by rank
          const entries = await db.query.UploadListEntry.findMany({
            where: (t, { eq }) => eq(t.uploadListId, parsedPlaylistId),
            columns: {},
            with: {
              upload: {
                columns: {
                  id: true,
                  title: true,
                  description: true,
                  publishedAt: true,
                  defaultThumbnailPath: true,
                  overrideThumbnailPath: true,
                  visibility: true,
                  transcodingFinishedAt: true,
                  deletedAt: true,
                },
              },
            },
            orderBy: (t, { asc }) => [asc(t.rank), asc(t.createdAt)],
            limit: 500,
          });

          // Filter to public, transcoded, non-deleted uploads
          const filteredEntries = entries.filter(
            (e) =>
              e.upload.visibility === 'PUBLIC' &&
              e.upload.transcodingFinishedAt !== null &&
              e.upload.deletedAt === null,
          );

          // Add items to feed
          for (const entry of filteredEntries) {
            const upload = entry.upload;
            const thumbnailUrl = resolveThumbnailUrl({
              overrideThumbnailPath: upload.overrideThumbnailPath,
              defaultThumbnailPath: upload.defaultThumbnailPath,
              channelDefaultThumbnailPath:
                playlist.channel.defaultThumbnailPath,
              size: 'card',
            });

            // guid stays the full-UUID URL (stable, historical — never change
            // it or readers re-surface every item); the visible link uses the
            // canonical short id.
            const uploadGuid = `${siteUrl}/media/${upload.id}`;
            const uploadUrl = `${siteUrl}/media/${idTranslator.fromUUID(upload.id)}`;

            const content = [
              thumbnailUrl
                ? `<img src="${thumbnailUrl}" alt="${upload.title}" />`
                : '',
              upload.description ? `<p>${upload.description}</p>` : '',
            ]
              .filter(Boolean)
              .join('\n');

            feed.addItem({
              title: upload.title ?? 'Untitled',
              id: uploadGuid,
              link: uploadUrl,
              description: upload.description ?? upload.title ?? 'Untitled',
              content,
              author: [
                {
                  name: playlist.channel.name,
                  link: channelUrl,
                },
              ],
              date: upload.publishedAt,
              ...(thumbnailUrl && { image: thumbnailUrl }),
            });
          }

          moduleLogger.info(
            {
              context: {
                playlistTitle: playlist.title,
                itemCount: filteredEntries.length,
              },
            },
            'Playlist RSS feed generated successfully',
          );

          return new Response(feed.rss2(), {
            status: 200,
            headers: {
              'Content-Type': 'application/rss+xml; charset=utf-8',
              'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            },
          });
        } catch (error) {
          moduleLogger.error(
            {
              context: {
                error: error instanceof Error ? error.message : String(error),
              },
            },
            'Failed to generate playlist RSS feed',
          );

          return new Response('Internal Server Error', {
            status: 500,
            headers: {
              'Content-Type': 'text/plain',
            },
          });
        }
      },
    },
  },
});
