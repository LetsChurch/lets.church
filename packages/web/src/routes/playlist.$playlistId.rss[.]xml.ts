import { prisma } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { createFileRoute } from '@tanstack/react-router';
import { Feed } from 'feed';
import { IncomingIdSchema } from '@/schemas/common';
import logger from '@/util/logger';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { getPublicImageUrl } from '@/util/url';

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
          const playlist = await prisma.uploadList.findUnique({
            select: {
              id: true,
              title: true,
              type: true,
              author: {
                select: {
                  username: true,
                },
              },
              channel: {
                select: {
                  name: true,
                  slug: true,
                  defaultThumbnailPath: true,
                  visibility: true,
                  approvedAt: true,
                  deletedAt: true,
                },
              },
            },
            where: {
              id: parsedPlaylistId,
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
                { resize: { width: 144, height: 144 } },
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
          const entries = await prisma.uploadListEntry.findMany({
            select: {
              upload: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  publishedAt: true,
                  defaultThumbnailPath: true,
                  overrideThumbnailPath: true,
                },
              },
            },
            where: {
              uploadListId: parsedPlaylistId,
              upload: {
                visibility: 'PUBLIC',
                transcodingFinishedAt: { not: null },
                transcribingFinishedAt: { not: null },
                deletedAt: null,
              },
            },
            orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
            take: 500,
          });

          // Add items to feed
          for (const entry of entries) {
            const upload = entry.upload;
            const thumbnailUrl = resolveThumbnailUrl({
              overrideThumbnailPath: upload.overrideThumbnailPath,
              defaultThumbnailPath: upload.defaultThumbnailPath,
              channelDefaultThumbnailPath:
                playlist.channel.defaultThumbnailPath,
              size: 'card',
            });

            const uploadUrl = `${siteUrl}/media/${upload.id}`;

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
              id: uploadUrl,
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
                itemCount: entries.length,
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
