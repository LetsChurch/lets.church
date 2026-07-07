import { Channel, db, UploadRecord } from '@letschurch/db';
import { createFileRoute } from '@tanstack/react-router';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { Feed } from 'feed';

import { idTranslator } from '@/schemas/common';
import logger from '@/util/logger';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { escapeHtml } from '@/util/xss';

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

          // Fetch latest 500 uploads ordered by publishedAt descending,
          // filtering channel conditions at the DB level via innerJoin.
          const uploads = await db
            .select({
              id: UploadRecord.id,
              title: UploadRecord.title,
              description: UploadRecord.description,
              publishedAt: UploadRecord.publishedAt,
              defaultThumbnailPath: UploadRecord.defaultThumbnailPath,
              overrideThumbnailPath: UploadRecord.overrideThumbnailPath,
              channel: {
                id: Channel.id,
                name: Channel.name,
                slug: Channel.slug,
                defaultThumbnailPath: Channel.defaultThumbnailPath,
              },
            })
            .from(UploadRecord)
            .innerJoin(
              Channel,
              and(
                eq(UploadRecord.channelId, Channel.id),
                eq(Channel.visibility, 'PUBLIC'),
                isNotNull(Channel.approvedAt),
              ),
            )
            .where(
              and(
                isNotNull(UploadRecord.transcodingFinishedAt),
                eq(UploadRecord.visibility, 'PUBLIC'),
                isNull(UploadRecord.deletedAt),
              ),
            )
            .orderBy(desc(UploadRecord.publishedAt))
            .limit(500);

          // Add items to feed
          for (const upload of uploads) {
            const thumbnailUrl = resolveThumbnailUrl({
              overrideThumbnailPath: upload.overrideThumbnailPath,
              defaultThumbnailPath: upload.defaultThumbnailPath,
              channelDefaultThumbnailPath: upload.channel.defaultThumbnailPath,
              size: 'card',
            });

            // guid stays the full-UUID URL (stable, historical — never change
            // it or readers re-surface every item); the visible link uses the
            // canonical short id.
            const uploadGuid = `${siteUrl}/media/${upload.id}`;
            const uploadUrl = `${siteUrl}/media/${idTranslator.fromUUID(upload.id)}`;
            const channelUrl = `${siteUrl}/channel/${upload.channel.slug}`;

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
                  name: upload.channel.name,
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
