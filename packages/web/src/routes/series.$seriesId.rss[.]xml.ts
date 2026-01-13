import { prisma } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { createFileRoute } from '@tanstack/react-router';
import { Feed } from 'feed';
import { IncomingIdSchema } from '@/schemas/common';
import logger from '@/util/logger';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { getPublicImageUrl, ResizeType } from '@/util/url';
import { rssFeedIcon } from '@/util/image-sizes';

const moduleLogger = logger.child({
  module: 'routes/series/$seriesId/rss.xml',
});

export const Route = createFileRoute('/series/$seriesId/rss.xml')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { seriesId } = params;

        moduleLogger.info('Generating series RSS feed');

        try {
          const siteUrl = process.env.PUBLIC_URL || 'https://lets.church';
          const parsedSeriesId = IncomingIdSchema.parse(seriesId);

          // Fetch series
          const series = await prisma.uploadList.findUnique({
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
              id: parsedSeriesId,
            },
          });

          if (!series) {
            moduleLogger.warn('Series not found');
            return new Response('Series not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          if (series.type !== 'SERIES') {
            moduleLogger.warn(
              {
                context: { type: series.type },
              },
              'Not a series',
            );
            return new Response('Series not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          if (!series.channel) {
            moduleLogger.warn('Series has no channel');
            return new Response('Series not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          if (
            series.channel.visibility !== 'PUBLIC' ||
            !series.channel.approvedAt ||
            series.channel.deletedAt
          ) {
            moduleLogger.warn(
              {
                context: {
                  visibility: series.channel.visibility,
                  approved: Boolean(series.channel.approvedAt),
                },
              },
              'Channel not accessible',
            );
            return new Response('Series not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          const seriesUrl = `${siteUrl}/series/${seriesId}`;
          const channelUrl = `${siteUrl}/channel/${series.channel.slug}`;

          const seriesImageUrl = series.channel.defaultThumbnailPath
            ? getPublicImageUrl(
                publicS3.getS3ProtocolUri(series.channel.defaultThumbnailPath),
                { resize: rssFeedIcon },
              )
            : null;

          const feed = new Feed({
            title: `${series.title} - ${series.channel.name} on Let's Church`,
            description: `Series by ${series.author.username} on ${series.channel.name}`,
            id: `${siteUrl}/series/${seriesId}/rss.xml`,
            link: seriesUrl,
            language: 'en',
            favicon: `${siteUrl}/favicon.svg`,
            copyright: `All rights reserved ${new Date().getFullYear()}, ${series.channel.name}`,
            feedLinks: {
              rss: `${siteUrl}/series/${seriesId}/rss.xml`,
            },
            ...(seriesImageUrl && {
              image: seriesImageUrl,
            }),
          });

          // Fetch series entries ordered by rank
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
              uploadListId: parsedSeriesId,
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
              channelDefaultThumbnailPath: series.channel.defaultThumbnailPath,
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
                  name: series.channel.name,
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
                seriesTitle: series.title,
                itemCount: entries.length,
              },
            },
            'Series RSS feed generated successfully',
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
            'Failed to generate series RSS feed',
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
