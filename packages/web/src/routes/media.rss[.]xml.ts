import { prisma } from '@letschurch/db';
import { createFileRoute } from '@tanstack/react-router';
import { Feed } from 'feed';
import logger from '@/util/logger';
import { resolveThumbnailUrl } from '@/util/thumbnails';

const moduleLogger = logger.child({
  module: 'routes/media/rss.xml',
});

export const Route = createFileRoute('/media/rss.xml')({
  component: () => null,
  server: {
    handlers: {
      GET: async () => {
        moduleLogger.info('Generating media RSS feed');

        try {
          const siteUrl = process.env.PUBLIC_URL || 'https://lets.church';

          const feed = new Feed({
            title: "Let's Church New Media",
            description: "New Media Uploaded to Let's Church",
            id: `${siteUrl}/media/rss.xml`,
            link: siteUrl,
            language: 'en',
            favicon: `${siteUrl}/favicon.svg`,
            copyright: `All rights reserved ${new Date().getFullYear()}, Let's Church`,
            feedLinks: {
              rss: `${siteUrl}/media/rss.xml`,
            },
          });

          // Fetch latest 500 uploads ordered by publishedAt descending
          const uploads = await prisma.uploadRecord.findMany({
            select: {
              id: true,
              title: true,
              description: true,
              publishedAt: true,
              createdAt: true,
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
              channel: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  defaultThumbnailPath: true,
                },
              },
            },
            where: {
              transcodingFinishedAt: { not: null },
              transcribingFinishedAt: { not: null },
              visibility: 'PUBLIC',
              channel: {
                visibility: 'PUBLIC',
                approvedAt: { not: null },
              },
            },
            orderBy: {
              publishedAt: 'desc',
            },
            take: 500,
          });

          // Add items to feed
          for (const upload of uploads) {
            const thumbnailUrl = resolveThumbnailUrl({
              overrideThumbnailPath: upload.overrideThumbnailPath,
              defaultThumbnailPath: upload.defaultThumbnailPath,
              channelDefaultThumbnailPath: upload.channel.defaultThumbnailPath,
              size: 'card',
            });

            const uploadUrl = `${siteUrl}/media/${upload.id}`;
            const channelUrl = `${siteUrl}/channel/${upload.channel.slug}`;

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
                  name: upload.channel.name,
                  link: channelUrl,
                },
              ],
              date: upload.publishedAt ?? upload.createdAt,
              ...(thumbnailUrl && { image: thumbnailUrl }),
            });
          }

          moduleLogger.info(
            {
              context: {
                itemCount: uploads.length,
              },
            },
            'Media RSS feed generated successfully',
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
            'Failed to generate media RSS feed',
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
