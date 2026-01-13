import { prisma } from '@letschurch/db';
import { publicS3 } from '@letschurch/s3/public';
import { createFileRoute } from '@tanstack/react-router';
import { Podcast } from 'podcast';
import logger from '@/util/logger';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import {
  getPublicImageUrl,
  getPublicMediaUrl,
  ResizeType,
} from '@/util/url';
import { podcastImage } from '@/util/image-sizes';

const moduleLogger = logger.child({
  module: 'routes/channel/$slug/podcast.xml',
});

export const Route = createFileRoute('/channel/$slug/podcast.xml')({
  component: () => null,
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { slug } = params;

        moduleLogger.info('Generating channel podcast feed');

        try {
          const siteUrl = process.env.PUBLIC_URL || 'https://lets.church';

          // Fetch channel
          const channel = await prisma.channel.findUnique({
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              defaultThumbnailPath: true,
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
            where: {
              slug,
              deletedAt: null,
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

          const channelImageUrl = channel.defaultThumbnailPath
            ? getPublicImageUrl(
                publicS3.getS3ProtocolUri(channel.defaultThumbnailPath),
                { resize: podcastImage },
              )
            : `${siteUrl}/favicon.svg`;

          const feed = new Podcast({
            title: channel.name,
            description:
              channel.description ||
              `New Media from ${channel.name} Uploaded to Let's Church`,
            feedUrl: `${siteUrl}/channel/${channel.slug}/podcast.xml`,
            siteUrl: `${siteUrl}/channel/${channel.slug}`,
            imageUrl: channelImageUrl,
            author: channel.name,
            copyright: `All rights reserved ${new Date().getFullYear()}, ${channel.name}`,
            language: 'en',
            itunesAuthor: channel.name,
            itunesOwner: {
              name: channel.name,
              email: process.env.PODCAST_OWNER_EMAIL || 'podcast@lets.church',
            },
            itunesImage: channelImageUrl,
            itunesCategory: [
              {
                text: 'Religion & Spirituality',
                subcats: [
                  {
                    text: 'Christianity',
                  },
                ],
              },
            ],
          });

          // Fetch latest 500 uploads from this channel with audio downloads
          const uploads = await prisma.uploadRecord.findMany({
            select: {
              id: true,
              title: true,
              description: true,
              publishedAt: true,
              defaultThumbnailPath: true,
              overrideThumbnailPath: true,
              variants: true,
              downloadSizes: {
                where: {
                  variant: 'AUDIO_DOWNLOAD',
                },
                select: {
                  bytes: true,
                },
              },
            },
            where: {
              transcodingFinishedAt: { not: null },
              transcribingFinishedAt: { not: null },
              visibility: 'PUBLIC',
              variants: {
                has: 'AUDIO_DOWNLOAD',
              },
              channel: {
                slug,
                visibility: 'PUBLIC',
                approvedAt: { not: null },
                deletedAt: null,
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
              channelDefaultThumbnailPath: channel.defaultThumbnailPath,
              size: 'card',
            });

            const uploadUrl = `${siteUrl}/media/${upload.id}`;
            const audioDownloadUrl = getPublicMediaUrl(
              `${upload.id}/AUDIO_DOWNLOAD.m4a`,
            );

            const downloadSize = upload.downloadSizes[0];
            const sizeBytes = downloadSize
              ? Number(downloadSize.bytes.valueOf())
              : 0;

            const content = [
              thumbnailUrl
                ? `<p><img src="${thumbnailUrl}" alt="${upload.title ?? 'Upload'}" /></p>`
                : '',
              upload.description ? `<p>${upload.description}</p>` : '',
            ]
              .filter(Boolean)
              .join('\n');

            feed.addItem({
              title: upload.title ?? 'Untitled',
              url: uploadUrl,
              description: upload.description ?? upload.title ?? 'Untitled',
              date: upload.publishedAt,
              content,
              enclosure: {
                url: audioDownloadUrl,
                size: sizeBytes,
                type: 'audio/mp4',
              },
              ...(thumbnailUrl && { itunesImage: thumbnailUrl }),
              itunesAuthor: channel.name,
            });
          }

          moduleLogger.info(
            {
              context: {
                channelName: channel.name,
                itemCount: uploads.length,
              },
            },
            'Channel podcast feed generated successfully',
          );

          const xml = feed.buildXml();

          return new Response(xml, {
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
            'Failed to generate channel podcast feed',
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
