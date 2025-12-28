import { prisma, UploadViewSource } from '@letschurch/db';
import { getPublicUrlWithFilename } from '@letschurch/s3';
import { publicS3 } from '@letschurch/s3/public';
import { xxh64 } from '@node-rs/xxhash';
import { getRequest } from '@tanstack/react-start/server';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeStringify from 'rehype-stringify';
import remarkBreaks from 'remark-breaks';
import remarkLinkify from 'remark-linkify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { type NodeCue, parseSync as parseVtt } from 'subtitle';
import { unified } from 'unified';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarXs2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { getClientIpAddress } from '@/util/request-ip';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { getPublicImageUrl, getPublicMediaUrl } from '@/util/url';
import { ffprobeSchema } from '@/util/zod';
import { authProcedure, publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/media',
});

const md = unified()
  .use(remarkLinkify)
  .use(remarkParse)
  .use(remarkBreaks)
  .use(remarkRehype)
  .use(rehypeExternalLinks, {
    rel: ['nofollow', 'noopener', 'noreferrer'],
    target: '_blank',
  })
  .use(rehypeStringify);

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
      moduleLogger.info(
        {
          context: {
            mediaId: input.mediaId,
          },
        },
        'Fetching media by ID',
      );

      const media = await prisma.uploadRecord.findUnique({
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
              visibility: true,
              approvedAt: true,
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

      // Check if channel is approved and public
      if (media.channel.visibility !== 'PUBLIC' || !media.channel.approvedAt) {
        moduleLogger.warn(
          {
            uploadId: input.mediaId,
            channelId: media.channel.id,
            context: {
              channelVisibility: media.channel.visibility,
              channelApproved: Boolean(media.channel.approvedAt),
            },
          },
          'Access denied to media from unapproved/non-public channel',
        );
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

      const thumbnailUrl = resolveThumbnailUrl({
        overrideThumbnailPath,
        defaultThumbnailPath,
        channelDefaultThumbnailPath: channel.defaultThumbnailPath,
        size: 'card',
      });

      const fullSizeThumbnailUrl = resolveThumbnailUrl({
        overrideThumbnailPath,
        defaultThumbnailPath,
        channelDefaultThumbnailPath: channel.defaultThumbnailPath,
        size: 'featured',
      });

      const posterThumbnailUrl = resolveThumbnailUrl({
        overrideThumbnailPath,
        defaultThumbnailPath,
        channelDefaultThumbnailPath: channel.defaultThumbnailPath,
        size: 'poster',
      });

      const channelAvatarUrl = channel.avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
            resize: appAvatarXs2x,
          })
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
        const subscription = await prisma.channelSubscription.findUnique({
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
        const savedMedia = await prisma.savedMedia.findUnique({
          where: {
            appUserId_uploadRecordId: {
              appUserId: ctx.session.appUserId,
              uploadRecordId: media.id,
            },
          },
        });
        isSaved = !!savedMedia;
      }

      // Check if current user can edit this media
      let canEdit = false;
      if (ctx.session) {
        if (ctx.isSiteAdmin) {
          canEdit = true;
        } else {
          const membership = await prisma.channelMembership.findUnique({
            where: {
              channelId_appUserId: {
                channelId: channel.id,
                appUserId: ctx.session.appUserId,
              },
            },
            select: {
              isAdmin: true,
              canEdit: true,
            },
          });

          canEdit = !!(membership?.isAdmin || membership?.canEdit);
        }
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
        const baseFilename = mediaRest.title ?? `media_${media.id}`;

        // Add video/audio downloads based on variants
        const downloadPromises: Array<Promise<void>> = [];

        for (const variant of variants) {
          if (
            variant.endsWith('_DOWNLOAD') &&
            !variant.includes('360P') // TODO: remove 360P, see ffmpeg.ts
          ) {
            const ext = variant.startsWith('VIDEO') ? 'mp4' : 'm4a';
            let kind: MediaDownloadKind = 'AUDIO';
            let label = 'Audio';
            let quality = '';

            if (variant === 'VIDEO_4K_DOWNLOAD') {
              kind = 'VIDEO_4K';
              label = '4k Video';
              quality = '4k';
            } else if (variant === 'VIDEO_1080P_DOWNLOAD') {
              kind = 'VIDEO_1080P';
              label = '1080p Video';
              quality = '1080p';
            } else if (variant === 'VIDEO_720P_DOWNLOAD') {
              kind = 'VIDEO_720P';
              label = '720p Video';
              quality = '720p';
            } else if (variant === 'VIDEO_480P_DOWNLOAD') {
              kind = 'VIDEO_480P';
              label = '480p Video';
              quality = '480p';
            }

            const filename = quality
              ? `${baseFilename} ${quality}.${ext}`
              : `${baseFilename}.${ext}`;
            const key = `${media.id}/${variant}.${ext}`;

            downloadPromises.push(
              getPublicUrlWithFilename(publicS3, key, filename).then((url) => {
                downloadUrls.push({
                  kind,
                  label,
                  url,
                });
              }),
            );
          }
        }

        // Add transcript downloads
        downloadPromises.push(
          getPublicUrlWithFilename(
            publicS3,
            `${media.id}/transcript.vtt`,
            `${baseFilename} transcript.vtt`,
          ).then((url) => {
            downloadUrls.push({
              kind: 'TRANSCRIPT_VTT',
              label: 'Transcript (vtt)',
              url,
            });
          }),
          getPublicUrlWithFilename(
            publicS3,
            `${media.id}/transcript.original.txt`,
            `${baseFilename} transcript.txt`,
          ).then((url) => {
            downloadUrls.push({
              kind: 'TRANSCRIPT_TXT',
              label: 'Transcript (txt)',
              url,
            });
          }),
        );

        // Wait for all signed URLs to be generated
        await Promise.all(downloadPromises);
      }

      // Compile markdown description to HTML if present
      const descriptionHtml = mediaRest.description
        ? String(await md.process(mediaRest.description))
        : null;

      return {
        ...mediaRest,
        descriptionHtml,
        id: OutgoingIdSchema.parse(mediaRest.id),
        thumbnailUrl,
        fullSizeThumbnailUrl,
        posterThumbnailUrl,
        mediaSource,
        audioSource,
        peaksJsonUrl,
        peaksDatUrl,
        width,
        height,
        downloadsEnabled,
        downloadUrls,
        isSaved,
        canEdit,
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
          .enum(UploadViewSource)
          .optional()
          .default(UploadViewSource.WEBSITE),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { uploadRecordId, source } = input;
      const clientIp = getClientIpAddress(getRequest().headers);
      const clientUserAgent = getRequest().headers.get('user-agent');

      moduleLogger.info(
        {
          context: {
            userId: ctx.session?.appUserId,
          },
        },
        'Creating upload view',
      );

      const trackingSalt = await prisma.trackingSalt.findFirst({
        orderBy: { id: 'desc' },
      });

      if (!trackingSalt || !clientUserAgent) {
        moduleLogger.warn(
          {
            context: {
              hasTrackingSalt: !!trackingSalt,
              hasUserAgent: !!clientUserAgent,
            },
          },
          'Missing tracking salt or user agent',
        );
        return null;
      }

      // The view hash will change once daily since the salt changes once daily
      const viewHash = u64ToSigned(
        xxh64(
          ctx.session?.appUserId ?? `${clientIp ?? ''}${clientUserAgent}`,
          BigInt(trackingSalt.salt),
        ),
      );

      const view = await prisma.uploadView.upsert({
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

      moduleLogger.info(
        {
          uploadRecordId: view.uploadRecordId,
          context: {
            viewHash: view.viewHash.toString(),
          },
        },
        'Upload view created',
      );

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
    .mutation(async ({ input, ctx }) => {
      const { uploadRecordId, viewHash, ranges } = input;

      moduleLogger.info(
        {
          context: {
            rangeCount: ranges.length,
          },
        },
        'Recording view seconds',
      );

      // Convert ranges to individual seconds
      const seconds = new Set<number>();
      for (const range of ranges) {
        const startSecond = Math.floor(range.start);
        const endSecond = Math.floor(range.end);
        for (let second = startSecond; second <= endSecond; second++) {
          seconds.add(second);
        }
      }

      const viewHashBigInt = BigInt(viewHash);

      // Create records for each second
      const creates = Array.from(seconds).map((second) => ({
        uploadRecordId,
        viewHash: viewHashBigInt,
        second,
      }));

      // Ensure the parent UploadView exists and create child records in a transaction
      await prisma.$transaction([
        prisma.uploadView.upsert({
          where: {
            uploadRecordId_viewHash: {
              uploadRecordId,
              viewHash: viewHashBigInt,
            },
          },
          create: {
            uploadRecordId,
            viewHash: viewHashBigInt,
            appUserId: ctx.session?.appUserId ?? null,
            source: UploadViewSource.WEBSITE,
          },
          update: {
            count: { increment: 1 },
          },
        }),
        prisma.uploadViewSecond.createMany({
          data: creates,
          skipDuplicates: true,
        }),
      ]);

      moduleLogger.info(
        {
          context: {
            secondsRecorded: seconds.size,
          },
        },
        'View seconds recorded',
      );

      return { success: true, secondsRecorded: seconds.size };
    }),

  getTranscript: publicProcedure
    .input(getTranscriptSchema)
    .query(async ({ input }) => {
      moduleLogger.info(
        {
          context: {
            mediaId: input.mediaId,
          },
        },
        'Fetching transcript',
      );

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
        moduleLogger.error(
          {
            context: {
              mediaId: input.mediaId,
              error: e,
            },
          },
          'Error fetching transcript',
        );
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

      moduleLogger.info('Rating media');

      // Check if user already rated this media
      const existingRating = await prisma.uploadUserRating.findUnique({
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
          await prisma.uploadUserRating.delete({
            where: {
              appUserId_uploadRecordId: {
                appUserId: userId,
                uploadRecordId: mediaId,
              },
            },
          });

          moduleLogger.info('Rating removed');

          return {
            userRating: null,
            previousRating: rating,
          };
        } else {
          // User is changing their rating
          await prisma.uploadUserRating.update({
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

          moduleLogger.info(
            {
              context: {
                previousRating: existingRating.rating,
              },
            },
            'Rating updated',
          );

          return {
            userRating: rating,
            previousRating: existingRating.rating,
          };
        }
      } else {
        // User is rating for the first time
        await prisma.uploadUserRating.create({
          data: {
            appUserId: userId,
            uploadRecordId: mediaId,
            rating,
          },
        });

        moduleLogger.info('New rating created');

        return {
          userRating: rating,
          previousRating: null,
        };
      }
    }),

  getMediaRating: publicProcedure
    .input(z.object({ mediaId: IncomingIdSchema }))
    .query(async ({ input, ctx }) => {
      moduleLogger.info(
        {
          context: {
            mediaId: input.mediaId,
            userId: ctx.session?.appUserId,
          },
        },
        'Fetching media rating',
      );

      // Get counts of likes and dislikes
      const [likes, dislikes, userRating] = await Promise.all([
        prisma.uploadUserRating.count({
          where: {
            uploadRecordId: input.mediaId,
            rating: 'LIKE',
          },
        }),
        prisma.uploadUserRating.count({
          where: {
            uploadRecordId: input.mediaId,
            rating: 'DISLIKE',
          },
        }),
        ctx.session
          ? prisma.uploadUserRating.findUnique({
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
      moduleLogger.info(
        {
          context: {
            mediaId: input.mediaId,
          },
        },
        'Fetching comments',
      );

      const comments = await prisma.uploadUserComment.findMany({
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
      moduleLogger.info(
        {
          context: {
            commentId: input.commentId,
          },
        },
        'Fetching replies',
      );

      const replies = await prisma.uploadUserComment.findMany({
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

      moduleLogger.info('Creating comment');

      // Fetch the upload record with channel and visibility information
      const upload = await prisma.uploadRecord.findUnique({
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
        const membership = await prisma.channelMembership.findUnique({
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
          moduleLogger.warn('Unauthorized comment attempt');
          throw new Error(
            `You must be a member of the channel to comment on this ${reason === 'private channel' ? 'channel' : 'video'}`,
          );
        }
      }

      const comment = await prisma.uploadUserComment.create({
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

      moduleLogger.info(
        {
          context: {
            commentId: comment.id,
          },
        },
        'Comment created successfully',
      );

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

      moduleLogger.info('Rating comment');

      // Check if user already rated this comment
      const existingRating = await prisma.uploadUserCommentRating.findUnique({
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
          await prisma.uploadUserCommentRating.delete({
            where: {
              appUserId_uploadUserCommentId: {
                appUserId: userId,
                uploadUserCommentId: commentId,
              },
            },
          });

          moduleLogger.info('Comment rating removed');

          return {
            userRating: null,
            previousRating: rating,
          };
        } else {
          // User is changing their rating
          await prisma.uploadUserCommentRating.update({
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

          moduleLogger.info(
            {
              context: {
                previousRating: existingRating.rating,
              },
            },
            'Comment rating updated',
          );

          return {
            userRating: rating,
            previousRating: existingRating.rating,
          };
        }
      } else {
        // User is rating for the first time
        await prisma.uploadUserCommentRating.create({
          data: {
            appUserId: userId,
            uploadUserCommentId: commentId,
            rating,
          },
        });

        moduleLogger.info('New comment rating created');

        return {
          userRating: rating,
          previousRating: null,
        };
      }
    }),
};
