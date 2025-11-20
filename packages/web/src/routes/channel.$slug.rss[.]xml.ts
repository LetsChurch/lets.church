import { prisma } from '@letschurch/db';
import { createFileRoute } from '@tanstack/react-router';
import { Feed } from 'feed';
import { getThumbnailResize } from '@/schemas/common';
import logger from '@/util/logger';
import { publicS3 } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';

const moduleLogger = logger.child({
  module: 'routes/channel/$slug/rss.xml',
});

export const Route = createFileRoute('/channel/$slug/rss.xml')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { slug } = params;

        moduleLogger.info('Generating channel RSS feed', { slug });

        try {
          const siteUrl = process.env.PUBLIC_URL || 'https://lets.church';

          // Fetch channel
          const channel = await prisma.channel.findUnique({
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              avatarPath: true,
              defaultThumbnailPath: true,
              visibility: true,
              approvedAt: true,
            },
            where: {
              slug,
            },
          });

          if (!channel) {
            moduleLogger.warn('Channel not found', { slug });
            return new Response('Channel not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          if (channel.visibility !== 'PUBLIC' || !channel.approvedAt) {
            moduleLogger.warn('Channel not accessible', {
              slug,
              visibility: channel.visibility,
              approved: Boolean(channel.approvedAt),
            });
            return new Response('Channel not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
              },
            });
          }

          const channelUrl = `${siteUrl}/channel/${channel.slug}`;

          const channelImageUrl = channel.defaultThumbnailPath
            ? getPublicImageUrl(
                publicS3.getS3ProtocolUri(channel.defaultThumbnailPath),
                { resize: { width: 144, height: 144 } },
              )
            : channel.avatarPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(channel.avatarPath),
                  { resize: { width: 144, height: 144 } },
                )
              : null;

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
          const uploads = await prisma.uploadRecord.findMany({
            select: {
              id: true,
              title: true,
              description: true,
              publishedAt: true,
              createdAt: true,
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
            },
            where: {
              transcodingFinishedAt: { not: null },
              transcribingFinishedAt: { not: null },
              visibility: 'PUBLIC',
              channel: {
                slug,
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
            const thumbnailPath =
              upload.overrideThumbnailPath ?? upload.defaultThumbnailPath;
            const thumbnailUrl = thumbnailPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(thumbnailPath),
                  getThumbnailResize('card'),
                )
              : channel.defaultThumbnailPath
                ? getPublicImageUrl(
                    publicS3.getS3ProtocolUri(channel.defaultThumbnailPath),
                    getThumbnailResize('card'),
                  )
                : null;

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
                  name: channel.name,
                  link: channelUrl,
                },
              ],
              date: upload.publishedAt ?? upload.createdAt,
              ...(thumbnailUrl && { image: thumbnailUrl }),
            });
          }

          moduleLogger.info('Channel RSS feed generated successfully', {
            slug,
            channelName: channel.name,
            itemCount: uploads.length,
          });

          return new Response(feed.rss2(), {
            status: 200,
            headers: {
              'Content-Type': 'application/rss+xml; charset=utf-8',
              'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            },
          });
        } catch (error) {
          moduleLogger.error('Failed to generate channel RSS feed', {
            slug,
            error: error instanceof Error ? error.message : String(error),
          });

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
