import { xxh64 } from '@node-rs/xxhash';
import { getWebRequest } from '@tanstack/react-start/server';
import { z } from 'zod';
import { getThumbnailResize } from '@/schemas/common';
import db from '@/util/db';
import logger from '@/util/logger';
import { getClientIpAddress } from '@/util/request-ip';
import { getS3ProtocolUri } from '@/util/s3';
import { getPublicImageUrl, getPublicMediaUrl } from '@/util/url';
import { ffprobeSchema } from '@/util/zod';
import { publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/media',
});

const getMediaByIdSchema = z.object({
  mediaId: z.uuid(),
});

export const mediaProcedures = {
  getMediaById: publicProcedure
    .input(getMediaByIdSchema)
    .query(async ({ input }) => {
      moduleLogger.info('Fetching media by ID', {
        mediaId: input.mediaId,
      });

      const media = await db.uploadRecord.findUnique({
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          publishedAt: true,
          lengthSeconds: true,
          defaultThumbnailPath: true,
          overrideThumbnailPath: true,
          variants: true,
          probe: true,
          channel: {
            select: {
              id: true,
              name: true,
              slug: true,
              avatarPath: true,
              defaultThumbnailPath: true,
              _count: {
                select: {
                  subscribers: true,
                },
              },
            },
          },
          _count: {
            select: {
              uploadViews: true,
            },
          },
        },
        where: {
          id: input.mediaId,
        },
      });

      if (!media) {
        throw new Error('Media not found');
      }

      const {
        defaultThumbnailPath,
        overrideThumbnailPath,
        channel,
        variants,
        ...mediaRest
      } = media;

      const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;
      const thumbnailUrl = thumbnailPath
        ? getPublicImageUrl(
            getS3ProtocolUri('PUBLIC', thumbnailPath),
            getThumbnailResize('card'),
          )
        : null;

      const fullSizeThumbnailUrl = thumbnailPath
        ? getPublicImageUrl(
            getS3ProtocolUri('PUBLIC', thumbnailPath),
            getThumbnailResize('featured'),
          )
        : null;

      const posterThumbnailUrl = thumbnailPath
        ? getPublicImageUrl(
            getS3ProtocolUri('PUBLIC', thumbnailPath),
            getThumbnailResize('poster'),
          )
        : null;

      const channelAvatarUrl = channel.avatarPath
        ? getPublicImageUrl(getS3ProtocolUri('PUBLIC', channel.avatarPath), {
            resize: { width: 32, height: 32 },
          })
        : null;

      const channelDefaultThumbnailUrl = channel.defaultThumbnailPath
        ? getPublicImageUrl(
            getS3ProtocolUri('PUBLIC', channel.defaultThumbnailPath),
            getThumbnailResize('card'),
          )
        : null;

      const channelDefaultPosterUrl = channel.defaultThumbnailPath
        ? getPublicImageUrl(
            getS3ProtocolUri('PUBLIC', channel.defaultThumbnailPath),
            getThumbnailResize('poster'),
          )
        : null;

      // Generate media source URLs based on available variants
      const hasVideo = variants.some((v) => v.startsWith('VIDEO'));
      const hasAudio = variants.includes('AUDIO');

      const mediaSource = hasVideo
        ? getPublicMediaUrl(`${media.id}/master.m3u8`)
        : null;

      const audioSource = hasAudio
        ? getPublicMediaUrl(`${media.id}/AUDIO.m3u8`)
        : null;

      // Extract video dimensions from probe data
      let width: number | null = null;
      let height: number | null = null;

      if (media.probe) {
        const parseResult = ffprobeSchema.safeParse(media.probe);
        if (parseResult.success) {
          const videoStream = parseResult.data.streams.find(
            (s) => s.codec_type === 'video',
          );
          if (videoStream && videoStream.codec_type === 'video') {
            width = videoStream.width;
            height = videoStream.height;
          }
        }
      }

      return {
        ...mediaRest,
        thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
        fullSizeThumbnailUrl:
          fullSizeThumbnailUrl || channelDefaultThumbnailUrl,
        posterThumbnailUrl: posterThumbnailUrl || channelDefaultPosterUrl,
        mediaSource,
        audioSource,
        width,
        height,
        channel: {
          id: channel.id,
          name: channel.name,
          slug: channel.slug,
          avatarUrl: channelAvatarUrl,
          subscriberCount: channel._count.subscribers,
        },
      };
    }),

  createUploadView: publicProcedure
    .input(
      z.object({
        uploadRecordId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { uploadRecordId } = input;
      const clientIp = getClientIpAddress(getWebRequest().headers);
      const clientUserAgent = getWebRequest().headers.get('user-agent');

      moduleLogger.info('Creating upload view', {
        uploadRecordId,
        clientIp,
        userId: ctx.session?.appUserId,
      });

      const trackingSalt = await db.trackingSalt.findFirst({
        orderBy: { id: 'desc' },
      });

      if (!trackingSalt || !clientUserAgent) {
        moduleLogger.warn('Missing tracking salt or user agent', {
          uploadRecordId,
          hasTrackingSalt: !!trackingSalt,
          hasUserAgent: !!clientUserAgent,
        });
        return null;
      }

      // The view hash will change once daily since the salt changes once daily
      const viewHash = xxh64(
        ctx.session?.appUserId ?? `${clientIp ?? ''}${clientUserAgent}`,
        BigInt(trackingSalt.salt),
      );

      const view = await db.uploadView.upsert({
        where: {
          uploadRecordId_viewHash: { uploadRecordId, viewHash },
        },
        create: {
          uploadRecordId,
          viewHash,
          appUserId: ctx.session?.appUserId ?? null,
        },
        update: {
          count: { increment: 1 },
        },
        select: {
          uploadRecordId: true,
          viewHash: true,
        },
      });

      moduleLogger.info('Upload view created', {
        uploadRecordId: view.uploadRecordId,
        viewHash: view.viewHash.toString(),
      });

      return {
        uploadRecordId: view.uploadRecordId,
        viewHash: view.viewHash.toString(),
      };
    }),

  recordViewSeconds: publicProcedure
    .input(
      z.object({
        uploadRecordId: z.string().uuid(),
        viewHash: z.string(),
        ranges: z.array(
          z.object({
            start: z.number(),
            end: z.number(),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      const { uploadRecordId, viewHash, ranges } = input;

      moduleLogger.info('Recording view seconds', {
        uploadRecordId,
        viewHash,
        rangeCount: ranges.length,
      });

      // Convert ranges to individual seconds
      const seconds = new Set<number>();
      for (const range of ranges) {
        const startSecond = Math.floor(range.start);
        const endSecond = Math.floor(range.end);
        for (let second = startSecond; second <= endSecond; second++) {
          seconds.add(second);
        }
      }

      // Create records for each second
      const viewHashBigInt = BigInt(viewHash);
      const creates = Array.from(seconds).map((second) => ({
        uploadRecordId,
        viewHash: viewHashBigInt,
        second,
      }));

      // Use createMany with skipDuplicates to handle already-tracked seconds
      await db.uploadViewSecond.createMany({
        data: creates,
        skipDuplicates: true,
      });

      moduleLogger.info('View seconds recorded', {
        uploadRecordId,
        viewHash,
        secondsRecorded: seconds.size,
      });

      return { success: true, secondsRecorded: seconds.size };
    }),
};
