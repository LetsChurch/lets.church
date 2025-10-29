import { xxh64 } from '@node-rs/xxhash';
import { UploadViewSource } from '@prisma/client';
import { getRequest } from '@tanstack/react-start/server';
import { type NodeCue, parseSync as parseVtt } from 'subtitle';
import { z } from 'zod';
import {
  getThumbnailResize,
  IncomingIdSchema,
  OutgoingIdSchema,
} from '@/schemas/common';
import db from '@/util/db';
import logger from '@/util/logger';
import { getClientIpAddress } from '@/util/request-ip';
import { getS3ProtocolUri } from '@/util/s3';
import { getPublicImageUrl, getPublicMediaUrl } from '@/util/url';
import { ffprobeSchema } from '@/util/zod';
import { authProcedure, publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/media',
});

const TWO64 = 1n << 64n;
const TWO63 = 1n << 63n;

function u64ToSigned(u: bigint): bigint {
  return u >= TWO63 ? u - TWO64 : u;
}

const getMediaByIdSchema = z.object({
  mediaId: IncomingIdSchema,
});

const getTranscriptSchema = z.object({
  mediaId: IncomingIdSchema,
});

export const mediaProcedures = {
  getMediaById: publicProcedure
    .input(getMediaByIdSchema)
    .query(async ({ input, ctx }) => {
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
          userCommentsEnabled: true,
          downloadsEnabled: true,
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
        downloadsEnabled,
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

      // Generate peaks URLs
      const peaksJsonUrl = getPublicMediaUrl(`${media.id}/peaks.json`);
      const peaksDatUrl = getPublicMediaUrl(`${media.id}/peaks.dat`);

      // Check if current user is following the channel
      let isFollowing = false;
      if (ctx.session?.appUserId) {
        const subscription = await db.channelSubscription.findUnique({
          where: {
            appUserId_channelId: {
              appUserId: ctx.session.appUserId,
              channelId: channel.id,
            },
          },
        });
        isFollowing = !!subscription;
      }

      // Check if current user has saved this media
      let isSaved = false;
      if (ctx.session?.appUserId) {
        const savedMedia = await db.savedMedia.findUnique({
          where: {
            appUserId_uploadRecordId: {
              appUserId: ctx.session.appUserId,
              uploadRecordId: media.id,
            },
          },
        });
        isSaved = !!savedMedia;
      }

      // Generate download URLs based on available variants
      type MediaDownloadKind =
        | 'VIDEO_4K'
        | 'VIDEO_1080P'
        | 'VIDEO_720P'
        | 'VIDEO_480P'
        | 'AUDIO'
        | 'TRANSCRIPT_VTT'
        | 'TRANSCRIPT_TXT';

      const downloadUrls: Array<{
        kind: MediaDownloadKind;
        label: string;
        url: string;
      }> = [];

      if (downloadsEnabled) {
        // Add video/audio downloads based on variants
        for (const variant of variants) {
          if (
            variant.endsWith('_DOWNLOAD') &&
            !variant.includes('360P') // TODO: remove 360P, see ffmpeg.ts
          ) {
            const ext = variant.startsWith('VIDEO') ? 'mp4' : 'm4a';
            let kind: MediaDownloadKind = 'AUDIO';
            let label = 'Audio';

            if (variant === 'VIDEO_4K_DOWNLOAD') {
              kind = 'VIDEO_4K';
              label = '4k Video';
            } else if (variant === 'VIDEO_1080P_DOWNLOAD') {
              kind = 'VIDEO_1080P';
              label = '1080p Video';
            } else if (variant === 'VIDEO_720P_DOWNLOAD') {
              kind = 'VIDEO_720P';
              label = '720p Video';
            } else if (variant === 'VIDEO_480P_DOWNLOAD') {
              kind = 'VIDEO_480P';
              label = '480p Video';
            }

            downloadUrls.push({
              kind,
              label,
              url: getPublicMediaUrl(`${media.id}/${variant}.${ext}`),
            });
          }
        }

        // Add transcript downloads
        downloadUrls.push(
          {
            kind: 'TRANSCRIPT_VTT',
            label: 'Transcript (vtt)',
            url: getPublicMediaUrl(`${media.id}/transcript.vtt`),
          },
          {
            kind: 'TRANSCRIPT_TXT',
            label: 'Transcript (txt)',
            url: getPublicMediaUrl(`${media.id}/transcript.original.txt`),
          },
        );
      }

      return {
        ...mediaRest,
        id: OutgoingIdSchema.parse(mediaRest.id),
        thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
        fullSizeThumbnailUrl:
          fullSizeThumbnailUrl || channelDefaultThumbnailUrl,
        posterThumbnailUrl: posterThumbnailUrl || channelDefaultPosterUrl,
        mediaSource,
        audioSource,
        peaksJsonUrl,
        peaksDatUrl,
        width,
        height,
        downloadsEnabled,
        downloadUrls,
        isSaved,
        channel: {
          id: OutgoingIdSchema.parse(channel.id),
          name: channel.name,
          slug: channel.slug,
          avatarUrl: channelAvatarUrl,
          subscriberCount: channel._count.subscribers,
          isFollowing,
        },
      };
    }),

  createUploadView: publicProcedure
    .input(
      z.object({
        uploadRecordId: IncomingIdSchema,
        source: z
          .nativeEnum(UploadViewSource)
          .optional()
          .default(UploadViewSource.WEBSITE),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { uploadRecordId, source } = input;
      const clientIp = getClientIpAddress(getRequest().headers);
      const clientUserAgent = getRequest().headers.get('user-agent');

      moduleLogger.info('Creating upload view', {
        uploadRecordId,
        clientIp,
        userId: ctx.session?.appUserId,
        source,
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
      const viewHash = u64ToSigned(
        xxh64(
          ctx.session?.appUserId ?? `${clientIp ?? ''}${clientUserAgent}`,
          BigInt(trackingSalt.salt),
        ),
      );

      const view = await db.uploadView.upsert({
        where: {
          uploadRecordId_viewHash: { uploadRecordId, viewHash },
        },
        create: {
          uploadRecordId,
          viewHash,
          appUserId: ctx.session?.appUserId ?? null,
          source,
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
        source,
      });

      return {
        uploadRecordId: OutgoingIdSchema.parse(view.uploadRecordId),
        viewHash: view.viewHash.toString(),
      };
    }),

  recordViewSeconds: publicProcedure
    .input(
      z.object({
        uploadRecordId: IncomingIdSchema,
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

  getTranscript: publicProcedure
    .input(getTranscriptSchema)
    .query(async ({ input }) => {
      moduleLogger.info('Fetching transcript', {
        mediaId: input.mediaId,
      });

      try {
        const url = getPublicMediaUrl(`${input.mediaId}/transcript.vtt`);
        const res = await fetch(url);

        if (!res.ok) {
          return null;
        }

        const text = await res.text();
        const parsed = parseVtt(text)
          .filter((n): n is NodeCue => n.type === 'cue')
          .map(({ data: { start, text } }) => ({ start, text }));

        return parsed;
      } catch (e) {
        moduleLogger.error('Error fetching transcript', {
          mediaId: input.mediaId,
          error: e,
        });
        return null;
      }
    }),

  rateMedia: authProcedure
    .input(
      z.object({
        mediaId: IncomingIdSchema,
        rating: z.enum(['LIKE', 'DISLIKE']),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { mediaId, rating } = input;
      const userId = ctx.session.appUserId;

      moduleLogger.info('Rating media', {
        mediaId,
        rating,
        userId,
      });

      // Check if user already rated this media
      const existingRating = await db.uploadUserRating.findUnique({
        where: {
          appUserId_uploadRecordId: {
            appUserId: userId,
            uploadRecordId: mediaId,
          },
        },
      });

      if (existingRating) {
        if (existingRating.rating === rating) {
          // User is clicking the same rating - remove it (toggle off)
          await db.uploadUserRating.delete({
            where: {
              appUserId_uploadRecordId: {
                appUserId: userId,
                uploadRecordId: mediaId,
              },
            },
          });

          moduleLogger.info('Rating removed', {
            mediaId,
            rating,
            userId,
          });

          return {
            userRating: null,
            previousRating: rating,
          };
        } else {
          // User is changing their rating
          await db.uploadUserRating.update({
            where: {
              appUserId_uploadRecordId: {
                appUserId: userId,
                uploadRecordId: mediaId,
              },
            },
            data: {
              rating,
            },
          });

          moduleLogger.info('Rating updated', {
            mediaId,
            rating,
            previousRating: existingRating.rating,
            userId,
          });

          return {
            userRating: rating,
            previousRating: existingRating.rating,
          };
        }
      } else {
        // User is rating for the first time
        await db.uploadUserRating.create({
          data: {
            appUserId: userId,
            uploadRecordId: mediaId,
            rating,
          },
        });

        moduleLogger.info('New rating created', {
          mediaId,
          rating,
          userId,
        });

        return {
          userRating: rating,
          previousRating: null,
        };
      }
    }),

  getMediaRating: publicProcedure
    .input(z.object({ mediaId: IncomingIdSchema }))
    .query(async ({ input, ctx }) => {
      moduleLogger.info('Fetching media rating', {
        mediaId: input.mediaId,
        userId: ctx.session?.appUserId,
      });

      // Get counts of likes and dislikes
      const [likes, dislikes, userRating] = await Promise.all([
        db.uploadUserRating.count({
          where: {
            uploadRecordId: input.mediaId,
            rating: 'LIKE',
          },
        }),
        db.uploadUserRating.count({
          where: {
            uploadRecordId: input.mediaId,
            rating: 'DISLIKE',
          },
        }),
        ctx.session
          ? db.uploadUserRating.findUnique({
              where: {
                appUserId_uploadRecordId: {
                  appUserId: ctx.session.appUserId,
                  uploadRecordId: input.mediaId,
                },
              },
              select: {
                rating: true,
              },
            })
          : null,
      ]);

      return {
        likes,
        dislikes,
        userRating: userRating?.rating ?? null,
      };
    }),

  getComments: publicProcedure
    .input(z.object({ mediaId: IncomingIdSchema }))
    .query(async ({ input, ctx }) => {
      moduleLogger.info('Fetching comments', {
        mediaId: input.mediaId,
      });

      const comments = await db.uploadUserComment.findMany({
        where: {
          uploadRecordId: input.mediaId,
          replyingToId: null, // Only top-level comments
        },
        select: {
          id: true,
          text: true,
          createdAt: true,
          score: true,
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarPath: true,
            },
          },
          _count: {
            select: {
              replies: true,
              userRatings: {
                where: { rating: 'LIKE' },
              },
            },
          },
          userRatings: ctx.session
            ? {
                where: {
                  appUserId: ctx.session.appUserId,
                },
                select: {
                  rating: true,
                },
              }
            : false,
        },
        orderBy: {
          score: 'desc',
        },
      });

      return comments.map((comment) => ({
        ...comment,
        id: OutgoingIdSchema.parse(comment.id),
        author: {
          ...comment.author,
          id: OutgoingIdSchema.parse(comment.author.id),
        },
        userRating: comment.userRatings?.[0]?.rating ?? null,
        likeCount: comment._count.userRatings,
        replyCount: comment._count.replies,
        userRatings: undefined,
      }));
    }),

  getReplies: publicProcedure
    .input(z.object({ commentId: IncomingIdSchema }))
    .query(async ({ input, ctx }) => {
      moduleLogger.info('Fetching replies', {
        commentId: input.commentId,
      });

      const replies = await db.uploadUserComment.findMany({
        where: {
          replyingToId: input.commentId,
        },
        select: {
          id: true,
          text: true,
          createdAt: true,
          score: true,
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarPath: true,
            },
          },
          _count: {
            select: {
              userRatings: {
                where: { rating: 'LIKE' },
              },
            },
          },
          userRatings: ctx.session
            ? {
                where: {
                  appUserId: ctx.session.appUserId,
                },
                select: {
                  rating: true,
                },
              }
            : false,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return replies.map((reply) => ({
        ...reply,
        id: OutgoingIdSchema.parse(reply.id),
        author: {
          ...reply.author,
          id: OutgoingIdSchema.parse(reply.author.id),
        },
        userRating: reply.userRatings?.[0]?.rating ?? null,
        likeCount: reply._count.userRatings,
        userRatings: undefined,
      }));
    }),

  createComment: authProcedure
    .input(
      z.object({
        mediaId: IncomingIdSchema,
        text: z.string().min(1).max(5000),
        replyingToId: IncomingIdSchema.optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { mediaId, text, replyingToId } = input;
      const userId = ctx.session.appUserId;

      moduleLogger.info('Creating comment', {
        mediaId,
        userId,
        replyingToId,
      });

      // Fetch the upload record with channel and visibility information
      const upload = await db.uploadRecord.findUnique({
        where: { id: mediaId },
        select: {
          id: true,
          visibility: true,
          channel: {
            select: {
              id: true,
              visibility: true,
            },
          },
        },
      });

      if (!upload) {
        throw new Error('Media not found');
      }

      // Check authorization based on channel and upload visibility
      const needsChannelMembership =
        upload.channel.visibility === 'PRIVATE' ||
        upload.visibility === 'PRIVATE';

      if (needsChannelMembership) {
        // Check if user is a member of the channel
        const membership = await db.channelMembership.findUnique({
          where: {
            channelId_appUserId: {
              channelId: upload.channel.id,
              appUserId: userId,
            },
          },
        });

        if (!membership) {
          const reason =
            upload.channel.visibility === 'PRIVATE'
              ? 'private channel'
              : 'private video';
          moduleLogger.warn('Unauthorized comment attempt', {
            mediaId,
            userId,
            reason,
          });
          throw new Error(
            `You must be a member of the channel to comment on this ${reason === 'private channel' ? 'channel' : 'video'}`,
          );
        }
      }

      const comment = await db.uploadUserComment.create({
        data: {
          uploadRecordId: mediaId,
          authorId: userId,
          text,
          replyingToId,
        },
        select: {
          id: true,
          text: true,
          createdAt: true,
          score: true,
          author: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarPath: true,
            },
          },
        },
      });

      moduleLogger.info('Comment created successfully', {
        commentId: comment.id,
        mediaId,
        userId,
      });

      return {
        ...comment,
        id: OutgoingIdSchema.parse(comment.id),
        author: {
          ...comment.author,
          id: OutgoingIdSchema.parse(comment.author.id),
        },
      };
    }),

  rateComment: authProcedure
    .input(
      z.object({
        commentId: IncomingIdSchema,
        rating: z.enum(['LIKE', 'DISLIKE']),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { commentId, rating } = input;
      const userId = ctx.session.appUserId;

      moduleLogger.info('Rating comment', {
        commentId,
        rating,
        userId,
      });

      // Check if user already rated this comment
      const existingRating = await db.uploadUserCommentRating.findUnique({
        where: {
          appUserId_uploadUserCommentId: {
            appUserId: userId,
            uploadUserCommentId: commentId,
          },
        },
      });

      if (existingRating) {
        if (existingRating.rating === rating) {
          // User is clicking the same rating - remove it (toggle off)
          await db.uploadUserCommentRating.delete({
            where: {
              appUserId_uploadUserCommentId: {
                appUserId: userId,
                uploadUserCommentId: commentId,
              },
            },
          });

          moduleLogger.info('Comment rating removed', {
            commentId,
            rating,
            userId,
          });

          return {
            userRating: null,
            previousRating: rating,
          };
        } else {
          // User is changing their rating
          await db.uploadUserCommentRating.update({
            where: {
              appUserId_uploadUserCommentId: {
                appUserId: userId,
                uploadUserCommentId: commentId,
              },
            },
            data: {
              rating,
            },
          });

          moduleLogger.info('Comment rating updated', {
            commentId,
            rating,
            previousRating: existingRating.rating,
            userId,
          });

          return {
            userRating: rating,
            previousRating: existingRating.rating,
          };
        }
      } else {
        // User is rating for the first time
        await db.uploadUserCommentRating.create({
          data: {
            appUserId: userId,
            uploadUserCommentId: commentId,
            rating,
          },
        });

        moduleLogger.info('New comment rating created', {
          commentId,
          rating,
          userId,
        });

        return {
          userRating: rating,
          previousRating: null,
        };
      }
    }),
};
