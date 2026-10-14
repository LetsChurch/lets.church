import { db } from '@letschurch/db';
import { createFileRoute } from '@tanstack/react-router';
import { Feed } from 'feed';

import { idTranslator } from '@/schemas/common';
import { rssFeedIcon } from '@/util/image-sizes';
import logger from '@/util/logger';
import { imageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { escapeHtml } from '@/util/xss';

const moduleLogger = logger.child({
  module: 'routes/channel/$slug/rss.xml',
});

export const Route = createFileRoute('/channel/$slug/rss.xml')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { slug } = params;

        moduleLogger.info('Generating channel RSS feed');

        try {
          const siteUrl = process.env.PUBLIC_URL || 'https://lets.church';

          // Fetch channel
          const channel = await db.query.Channel.findFirst({
            where: (t, { eq, and, isNull }) =>
              and(eq(t.slug, slug), isNull(t.deletedAt)),
            columns: {
              id: true,
              name: true,
              slug: true,
              description: true,
              avatarPath: true,
              avatarLocation: true,
              defaultThumbnailPath: true,
              defaultThumbnailLocation: true,
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
          });

          if (!channel) {
            moduleLogger.warn('Channel not found');
            return new Response('Channel not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          if (
            channel.visibility !== 'PUBLIC' ||
            !channel.approvedAt ||
            channel.deletedAt
          ) {
            moduleLogger.warn(
              {
                context: {
                  visibility: channel.visibility,
                  approved: Boolean(channel.approvedAt),
                },
              },
              'Channel not accessible',
            );
            return new Response('Channel not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          const channelUrl = `${siteUrl}/channel/${channel.slug}`;

          const channelImageUrl =
            imageUrl(
              channel.defaultThumbnailLocation,
              channel.defaultThumbnailPath,
              { resize: rssFeedIcon },
            ) ??
            imageUrl(channel.avatarLocation, channel.avatarPath, {
              resize: rssFeedIcon,
            });

          const feed = new Feed({
            title: `New Media from ${channel.name} on Let's Church`,
            description:
              channel.description ||
              `New Media from ${channel.name} Uploaded to Let's Church`,
            id: `${siteUrl}/channel/${channel.slug}/rss.xml`,
            link: channelUrl,
            language: 'en',
            favicon: `${siteUrl}/favicon.svg`,
            copyright: `All rights reserved ${new Date().getFullYear()}, ${channel.name}`,
            feedLinks: {
              rss: `${siteUrl}/channel/${channel.slug}/rss.xml`,
            },
            ...(channelImageUrl && {
              image: channelImageUrl,
            }),
          });

          // Fetch latest 500 uploads from this channel ordered by publishedAt descending
          const uploads = await db.query.UploadRecord.findMany({
            where: (t, { isNotNull, eq, and }) =>
              and(
                isNotNull(t.transcodingFinishedAt),
                eq(t.visibility, 'PUBLIC'),
                eq(t.channelId, channel.id),
              ),
            columns: {
              id: true,
              title: true,
              description: true,
              publishedAt: true,
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
              storageLocation: true,
            },
            orderBy: (t, { desc }) => desc(t.publishedAt),
            limit: 500,
          });

          // Add items to feed
          for (const upload of uploads) {
            const thumbnailUrl = resolveThumbnailUrl({
              storageLocation: upload.storageLocation,
              overrideThumbnailPath: upload.overrideThumbnailPath,
              defaultThumbnailPath: upload.defaultThumbnailPath,
              channelDefaultThumbnailPath: channel.defaultThumbnailPath,
              channelDefaultThumbnailLocation: channel.defaultThumbnailLocation,
              size: 'card',
            });

            // guid stays the full-UUID URL (stable, historical — never change
            // it or readers re-surface every item); the visible link uses the
            // canonical short id.
            const uploadGuid = `${siteUrl}/media/${upload.id}`;
            const uploadUrl = `${siteUrl}/media/${idTranslator.fromUUID(upload.id)}`;

            const content = [
              thumbnailUrl
                ? `<img src="${thumbnailUrl}" alt="${escapeHtml(upload.title)}" />`
                : '',
              upload.description
                ? `<p>${escapeHtml(upload.description)}</p>`
                : '',
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
                  name: channel.name,
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
                channelName: channel.name,
                itemCount: uploads.length,
              },
            },
            'Channel RSS feed generated successfully',
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
            'Failed to generate channel RSS feed',
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
