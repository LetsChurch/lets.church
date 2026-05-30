import {
  ChannelSubscription,
  db,
  TranscriptParagraph,
  UploadList,
  UploadListEntry,
  UploadUserComment,
  UploadUserCommentRating,
  UploadUserRating,
  UploadView,
  UploadViewSecond,
  UploadViewSource,
} from '@letschurch/db';
import { getPublicUrlWithFilename } from '@letschurch/s3';
import { publicS3 } from '@letschurch/s3/public';
import { CURRENT_PIPELINE_VERSION } from '@letschurch/temporal/queues';
import { xxh64 } from '@node-rs/xxhash';
import { getRequest } from '@tanstack/react-start/server';
import { TRPCError } from '@trpc/server';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
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
import {
  getPublicImageUrl,
  getPublicMediaUrl,
  makeDownloadServiceUrl,
} from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { ffprobeSchema } from '@/util/zod';
import { authProcedure, publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/media',
});

const TIMESTAMP_RE = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/g;

function timestampToSeconds(ts: string): number {
  const parts = ts.split(':').map(Number);
  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
}

type AnyNode = {
  type: string;
  value?: string;
  tagName?: string;
  children?: AnyNode[];
  properties?: Record<string, string>;
};

function walkTimestamps(node: AnyNode): void {
  if (!node.children) return;

  // Skip text nodes inside anchor tags
  if (node.tagName === 'a') return;

  const replacements: Array<{ index: number; nodes: AnyNode[] }> = [];

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === 'text' && child.value) {
      const text = child.value;
      const nodes: AnyNode[] = [];
      let last = 0;

      TIMESTAMP_RE.lastIndex = 0;
      let m = TIMESTAMP_RE.exec(text);
      while (m !== null) {
        const seconds = timestampToSeconds(m[0]);
        if (m.index > last)
          nodes.push({ type: 'text', value: text.slice(last, m.index) });
        nodes.push({
          type: 'element',
          tagName: 'a',
          properties: {
            href: `#t=${seconds}`,
            'data-timestamp': String(seconds),
          },
          children: [{ type: 'text', value: m[0] }],
        });
        last = m.index + m[0].length;
        m = TIMESTAMP_RE.exec(text);
      }

      if (nodes.length > 0) {
        if (last < text.length)
          nodes.push({ type: 'text', value: text.slice(last) });
        replacements.push({ index: i, nodes });
      }
    } else {
      walkTimestamps(child);
    }
  }

  for (const { index, nodes } of replacements.reverse()) {
    node.children.splice(index, 1, ...nodes);
  }
}

function rehypeTimestamps() {
  return (tree: AnyNode) => walkTimestamps(tree);
}

const md = unified()
  .use(remarkLinkify)
  .use(remarkParse)
  .use(remarkBreaks)
  .use(remarkRehype)
  .use(rehypeExternalLinks, {
    rel: ['nofollow', 'noopener', 'noreferrer'],
    target: '_blank',
  })
  .use(rehypeTimestamps)
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

      const sessionUserId = ctx.session?.appUserId ?? null;

      const media = await db.query.UploadRecord.findFirst({
        columns: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          publishedAt: true,
          lengthSeconds: true,
          defaultThumbnailPath: true,
          overrideThumbnailPath: true,
          variants: true,
          pipelineVersion: true,
          probe: true,
          userCommentsEnabled: true,
          downloadsEnabled: true,
          license: true,
          transcribingFinishedAt: true,
          visibility: true,
          // LLM-generated display summary (Summary tab). Null until the
          // post-transcript summarize-upload activity has run for this upload.
          summary: true,
        },
        with: {
          channel: {
            columns: {
              id: true,
              name: true,
              slug: true,
              avatarPath: true,
              defaultThumbnailPath: true,
              visibility: true,
              approvedAt: true,
            },
          },
        },
        where: (t, { eq }) => eq(t.id, input.mediaId),
      });

      if (!media) {
        throw new Error('Media not found');
      }

      // Check if channel is approved and not private
      if (media.channel.visibility === 'PRIVATE' || !media.channel.approvedAt) {
        moduleLogger.warn(
          {
            uploadId: input.mediaId,
            channelId: media.channel.id,
            context: {
              channelVisibility: media.channel.visibility,
              channelApproved: Boolean(media.channel.approvedAt),
            },
          },
          'Access denied to media from unapproved/private channel',
        );
        throw new Error('Media not found');
      }

      // Check if upload itself is private
      if (media.visibility === 'PRIVATE') {
        if (!sessionUserId) {
          throw new Error('Media not found');
        }
        if (!ctx.isSiteAdmin) {
          const membershipCheck = await db.query.ChannelMembership.findFirst({
            columns: { appUserId: true },
            where: (t, { and, eq }) =>
              and(
                eq(t.channelId, media.channel.id),
                eq(t.appUserId, sessionUserId),
              ),
          });
          if (!membershipCheck) {
            throw new Error('Media not found');
          }
        }
      }

      const {
        defaultThumbnailPath,
        overrideThumbnailPath,
        channel,
        variants,
        pipelineVersion,
        downloadsEnabled,
        transcribingFinishedAt,
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

      const [
        subscription,
        savedMedia,
        membership,
        viewCountResult,
        subscriberCountResult,
      ] = await Promise.all([
        sessionUserId
          ? db.query.ChannelSubscription.findFirst({
              columns: { appUserId: true },
              where: (t, { and, eq }) =>
                and(
                  eq(t.appUserId, sessionUserId),
                  eq(t.channelId, channel.id),
                ),
            })
          : null,
        sessionUserId
          ? db.query.SavedMedia.findFirst({
              columns: { id: true },
              where: (t, { and, eq }) =>
                and(
                  eq(t.appUserId, sessionUserId),
                  eq(t.uploadRecordId, media.id),
                ),
            })
          : null,
        sessionUserId && !ctx.isSiteAdmin
          ? db.query.ChannelMembership.findFirst({
              columns: { isAdmin: true, canEdit: true },
              where: (t, { and, eq }) =>
                and(
                  eq(t.channelId, channel.id),
                  eq(t.appUserId, sessionUserId),
                ),
            })
          : null,
        db
          .select({ count: count() })
          .from(UploadView)
          .where(eq(UploadView.uploadRecordId, media.id))
          .then((r) => r[0]),
        db
          .select({ count: count() })
          .from(ChannelSubscription)
          .where(eq(ChannelSubscription.channelId, channel.id))
          .then((r) => r[0]),
      ]);

      const isFollowing = !!subscription;
      const isSaved = !!savedMedia;
      const canEdit =
        ctx.isSiteAdmin || !!(membership?.isAdmin || membership?.canEdit);
      const viewCount = viewCountResult?.count ?? 0;
      const subscriberCount = Number(subscriberCountResult?.count ?? 0);

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
        const isLegacyPipeline = pipelineVersion < CURRENT_PIPELINE_VERSION;

        const downloadPromises: Array<Promise<void>> = [];

        if (isLegacyPipeline) {
          // Old format: serve presigned S3 URLs for pre-generated files
          const legacyVideoVariantOrder = [
            'VIDEO_4K_DOWNLOAD',
            'VIDEO_1080P_DOWNLOAD',
            'VIDEO_720P_DOWNLOAD',
            'VIDEO_480P_DOWNLOAD',
          ];
          const availableLegacyVideoVariants = variants.filter((v) =>
            legacyVideoVariantOrder.includes(v),
          );
          const highQualityLegacyVariants = availableLegacyVideoVariants.filter(
            (v) => v === 'VIDEO_4K_DOWNLOAD' || v === 'VIDEO_1080P_DOWNLOAD',
          );
          const allowedLegacyVideoVariants = new Set(
            highQualityLegacyVariants.length > 0
              ? highQualityLegacyVariants
              : availableLegacyVideoVariants.slice(0, 1),
          );

          for (const variant of variants) {
            if (
              variant.endsWith('_DOWNLOAD') &&
              !variant.includes('360P') // TODO: remove 360P, see ffmpeg.ts
            ) {
              if (
                legacyVideoVariantOrder.includes(variant) &&
                !allowedLegacyVideoVariants.has(variant)
              ) {
                continue;
              }
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
                getPublicUrlWithFilename(publicS3, key, filename).then(
                  (url) => {
                    downloadUrls.push({ kind, label, url });
                  },
                ),
              );
            }
          }
        } else {
          // New format: signed download service URLs
          type VideoEntry = {
            kind: MediaDownloadKind;
            label: string;
            variant: string;
            ext: string;
            quality: string;
          };

          const allVideoResolutionEntries: Array<VideoEntry> = [
            {
              kind: 'VIDEO_4K',
              label: '4k Video',
              variant: 'VIDEO_4K',
              ext: 'mp4',
              quality: '4k',
            },
            {
              kind: 'VIDEO_1080P',
              label: '1080p Video',
              variant: 'VIDEO_1080P',
              ext: 'mp4',
              quality: '1080p',
            },
            {
              kind: 'VIDEO_720P',
              label: '720p Video',
              variant: 'VIDEO_720P',
              ext: 'mp4',
              quality: '720p',
            },
            {
              kind: 'VIDEO_480P',
              label: '480p Video',
              variant: 'VIDEO_480P',
              ext: 'mp4',
              quality: '480p',
            },
          ];

          // Only offer 4K/1080p for download; if neither is available, fall back to the highest available resolution
          const availableVideoResolutionEntries =
            allVideoResolutionEntries.filter((e) =>
              variants.includes(e.variant as (typeof variants)[number]),
            );
          const highQualityVideoEntries =
            availableVideoResolutionEntries.filter(
              (e) => e.kind === 'VIDEO_4K' || e.kind === 'VIDEO_1080P',
            );
          const filteredVideoResolutionEntries =
            highQualityVideoEntries.length > 0
              ? highQualityVideoEntries
              : availableVideoResolutionEntries.slice(0, 1);

          const videoEntries: Array<VideoEntry> = [
            ...filteredVideoResolutionEntries,
            {
              kind: 'AUDIO',
              label: 'Audio',
              variant: 'AUDIO',
              ext: 'm4a',
              quality: '',
            },
          ];

          for (const entry of videoEntries) {
            if (
              !variants.includes(entry.variant as (typeof variants)[number])
            ) {
              continue;
            }
            const filename = entry.quality
              ? `${baseFilename} ${entry.quality}.${entry.ext}`
              : `${baseFilename}.${entry.ext}`;
            downloadUrls.push({
              kind: entry.kind,
              label: entry.label,
              url: await makeDownloadServiceUrl(
                media.id,
                entry.variant,
                filename,
              ),
            });
          }
        }

        // Add transcript downloads only if transcription completed
        if (transcribingFinishedAt) {
          // Two generations of uploads live side-by-side in S3:
          //   * New (Python transcribe worker, this branch): uploads
          //     `transcript.txt` (paragraphs joined with blank lines) and
          //     persists rows to `transcript_paragraph`.
          //   * Legacy (older TS worker): uploaded `transcript.original.txt`
          //     (raw whisper output, no paragraph grouping) and did not
          //     populate `transcript_paragraph`.
          // Presence of paragraph rows is the cleanest signal for which
          // generation produced this upload — we don't have to probe S3
          // and the bit aligns with what's actually shown in the UI.
          const hasParagraphs =
            (
              await db
                .select({ id: TranscriptParagraph.id })
                .from(TranscriptParagraph)
                .where(eq(TranscriptParagraph.uploadRecordId, media.id))
                .limit(1)
            ).length > 0;
          const txtKey = hasParagraphs
            ? `${media.id}/transcript.txt`
            : `${media.id}/transcript.original.txt`;
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
              txtKey,
              `${baseFilename} transcript.txt`,
            ).then((url) => {
              downloadUrls.push({
                kind: 'TRANSCRIPT_TXT',
                label: 'Transcript (txt)',
                url,
              });
            }),
          );
        }

        // Wait for all signed URLs to be generated
        await Promise.all(downloadPromises);
      }

      // Compile markdown description to HTML if present
      const descriptionHtml = mediaRest.description
        ? String(await md.process(mediaRest.description))
        : null;

      // Look up the upload's series (if any)
      const [seriesRow] = await db
        .select({ id: UploadList.id, title: UploadList.title })
        .from(UploadListEntry)
        .innerJoin(UploadList, eq(UploadListEntry.uploadListId, UploadList.id))
        .where(
          and(
            eq(UploadListEntry.uploadRecordId, input.mediaId),
            eq(UploadList.type, 'SERIES'),
          ),
        )
        .limit(1);

      const series = seriesRow
        ? { id: OutgoingIdSchema.parse(seriesRow.id), title: seriesRow.title }
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
        viewCount,
        transcribingFinishedAt,
        series,
        channel: {
          id: OutgoingIdSchema.parse(channel.id),
          name: channel.name,
          slug: channel.slug,
          avatarUrl: channelAvatarUrl,
          subscriberCount,
          isFollowing,
        },
      };
    }),

  getMediaSources: publicProcedure
    .input(z.object({ mediaId: IncomingIdSchema }))
    .query(async ({ input, ctx }) => {
      const sessionUserId = ctx.session?.appUserId ?? null;

      const media = await db.query.UploadRecord.findFirst({
        columns: { id: true, variants: true, probe: true, visibility: true },
        with: {
          channel: {
            columns: { id: true, visibility: true, approvedAt: true },
          },
        },
        where: (t, { eq }) => eq(t.id, input.mediaId),
      });

      if (!media) return null;

      if (media.channel.visibility === 'PRIVATE' || !media.channel.approvedAt) {
        return null;
      }

      if (media.visibility === 'PRIVATE') {
        if (!sessionUserId) return null;
        if (!ctx.isSiteAdmin) {
          const membershipCheck = await db.query.ChannelMembership.findFirst({
            columns: { appUserId: true },
            where: (t, { and, eq }) =>
              and(
                eq(t.channelId, media.channel.id),
                eq(t.appUserId, sessionUserId),
              ),
          });
          if (!membershipCheck) return null;
        }
      }

      const hasVideo = media.variants.some((v) => v.startsWith('VIDEO'));
      const hasAudio = media.variants.includes('AUDIO');

      if (!hasVideo && !hasAudio) return null;

      const mediaSource = hasVideo
        ? getPublicMediaUrl(`${media.id}/master.m3u8`)
        : null;
      const audioSource = hasAudio
        ? getPublicMediaUrl(`${media.id}/AUDIO.m3u8`)
        : null;

      let videoWidth = 1280;
      let videoHeight = 720;

      if (media.probe) {
        const parseResult = ffprobeSchema.safeParse(media.probe);
        if (parseResult.success) {
          const videoStream = parseResult.data.streams.find(
            (s) => s.codec_type === 'video',
          );
          if (videoStream && videoStream.codec_type === 'video') {
            videoWidth = videoStream.width;
            videoHeight = videoStream.height;
          }
        }
      }

      return { mediaSource, audioSource, videoWidth, videoHeight };
    }),

  createUploadView: publicProcedure
    .input(
      z.object({
        uploadRecordId: IncomingIdSchema,
        source: z
          .enum(UploadViewSource.enumValues)
          .optional()
          .default('WEBSITE'),
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

      const trackingSalt = await db.query.TrackingSalt.findFirst({
        orderBy: (t, { desc }) => [desc(t.id)],
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

      const [view] = await db
        .insert(UploadView)
        .values({
          uploadRecordId,
          viewHash,
          appUserId: ctx.session?.appUserId ?? null,
          source,
        })
        .onConflictDoUpdate({
          target: [UploadView.uploadRecordId, UploadView.viewHash],
          set: {
            count: sql`${UploadView.count} + 1`,
          },
        })
        .returning({
          uploadRecordId: UploadView.uploadRecordId,
          viewHash: UploadView.viewHash,
        });

      moduleLogger.info(
        {
          uploadRecordId: view?.uploadRecordId,
          context: {
            viewHash: view?.viewHash.toString(),
          },
        },
        'Upload view created',
      );

      return {
        uploadRecordId: OutgoingIdSchema.parse(view?.uploadRecordId),
        viewHash: view?.viewHash.toString(),
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
      await db.transaction(async (tx) => {
        await tx
          .insert(UploadView)
          .values({
            uploadRecordId,
            viewHash: viewHashBigInt,
            appUserId: ctx.session?.appUserId ?? null,
            source: 'WEBSITE',
          })
          .onConflictDoNothing();

        if (creates.length > 0) {
          await tx
            .insert(UploadViewSecond)
            .values(creates)
            .onConflictDoNothing();
        }
      });

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
    .query(async ({ input, ctx }) => {
      moduleLogger.info(
        {
          context: {
            mediaId: input.mediaId,
          },
        },
        'Fetching transcript',
      );

      const sessionUserId = ctx.session?.appUserId ?? null;
      const media = await db.query.UploadRecord.findFirst({
        columns: { id: true, visibility: true },
        with: {
          channel: {
            columns: { id: true, visibility: true, approvedAt: true },
          },
        },
        where: (t, { eq }) => eq(t.id, input.mediaId),
      });

      if (!media) return null;

      if (media.channel.visibility === 'PRIVATE' || !media.channel.approvedAt) {
        return null;
      }

      if (media.visibility === 'PRIVATE') {
        if (!sessionUserId) return null;
        if (!ctx.isSiteAdmin) {
          const membershipCheck = await db.query.ChannelMembership.findFirst({
            columns: { appUserId: true },
            where: (t, { and, eq }) =>
              and(
                eq(t.channelId, media.channel.id),
                eq(t.appUserId, sessionUserId),
              ),
          });
          if (!membershipCheck) return null;
        }
      }

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

  // Paragraph transcript with per-word timings (the newer pipeline). Returns
  // null when no rows exist so the client can fall back to the legacy VTT
  // transcript (getTranscript). Access checks mirror getTranscript exactly.
  getTranscriptParagraphs: publicProcedure
    .input(getTranscriptSchema)
    .query(async ({ input, ctx }) => {
      const sessionUserId = ctx.session?.appUserId ?? null;
      const media = await db.query.UploadRecord.findFirst({
        columns: { id: true, visibility: true },
        with: {
          channel: {
            columns: { id: true, visibility: true, approvedAt: true },
          },
        },
        where: (t, { eq }) => eq(t.id, input.mediaId),
      });

      if (!media) return null;

      if (media.channel.visibility === 'PRIVATE' || !media.channel.approvedAt) {
        return null;
      }

      if (media.visibility === 'PRIVATE') {
        if (!sessionUserId) return null;
        if (!ctx.isSiteAdmin) {
          const membershipCheck = await db.query.ChannelMembership.findFirst({
            columns: { appUserId: true },
            where: (t, { and, eq }) =>
              and(
                eq(t.channelId, media.channel.id),
                eq(t.appUserId, sessionUserId),
              ),
          });
          if (!membershipCheck) return null;
        }
      }

      const paragraphs = await db.query.TranscriptParagraph.findMany({
        columns: {
          order: true,
          start: true,
          end: true,
          speaker: true,
          text: true,
          words: true,
        },
        where: (t, { eq }) => eq(t.uploadRecordId, input.mediaId),
        orderBy: (t, { asc }) => asc(t.order),
      });

      if (paragraphs.length === 0) return null;

      return paragraphs;
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
      const existingRating = await db.query.UploadUserRating.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.appUserId, userId), eq(t.uploadRecordId, mediaId)),
      });

      if (existingRating) {
        if (existingRating.rating === rating) {
          // User is clicking the same rating - remove it (toggle off)
          await db
            .delete(UploadUserRating)
            .where(
              and(
                eq(UploadUserRating.appUserId, userId),
                eq(UploadUserRating.uploadRecordId, mediaId),
              ),
            );

          moduleLogger.info('Rating removed');

          return {
            userRating: null,
            previousRating: rating,
          };
        } else {
          // User is changing their rating
          await db
            .update(UploadUserRating)
            .set({ rating })
            .where(
              and(
                eq(UploadUserRating.appUserId, userId),
                eq(UploadUserRating.uploadRecordId, mediaId),
              ),
            );

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
        await db.insert(UploadUserRating).values({
          appUserId: userId,
          uploadRecordId: mediaId,
          rating,
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

      const sessionUserId = ctx.session?.appUserId;

      // Get counts of likes and dislikes
      const [likesResult, dislikesResult, userRating] = await Promise.all([
        db
          .select({ count: count() })
          .from(UploadUserRating)
          .where(
            and(
              eq(UploadUserRating.uploadRecordId, input.mediaId),
              eq(UploadUserRating.rating, 'LIKE'),
            ),
          )
          .then((r) => r[0]?.count),
        db
          .select({ count: count() })
          .from(UploadUserRating)
          .where(
            and(
              eq(UploadUserRating.uploadRecordId, input.mediaId),
              eq(UploadUserRating.rating, 'DISLIKE'),
            ),
          )
          .then((r) => r[0]?.count),
        sessionUserId
          ? db.query.UploadUserRating.findFirst({
              columns: { rating: true },
              where: (t, { and, eq }) =>
                and(
                  eq(t.appUserId, sessionUserId),
                  eq(t.uploadRecordId, input.mediaId),
                ),
            })
          : null,
      ]);

      return {
        likes: likesResult ?? 0,
        dislikes: dislikesResult ?? 0,
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

      const sessionUserId = ctx.session?.appUserId ?? null;
      const media = await db.query.UploadRecord.findFirst({
        columns: { id: true, visibility: true },
        with: {
          channel: {
            columns: { id: true, visibility: true, approvedAt: true },
          },
        },
        where: (t, { eq }) => eq(t.id, input.mediaId),
      });

      if (!media) return [];

      if (media.channel.visibility === 'PRIVATE' || !media.channel.approvedAt) {
        return [];
      }

      if (media.visibility === 'PRIVATE') {
        if (!sessionUserId) return [];
        if (!ctx.isSiteAdmin) {
          const membershipCheck = await db.query.ChannelMembership.findFirst({
            columns: { appUserId: true },
            where: (t, { and, eq }) =>
              and(
                eq(t.channelId, media.channel.id),
                eq(t.appUserId, sessionUserId),
              ),
          });
          if (!membershipCheck) return [];
        }
      }

      const comments = await db.query.UploadUserComment.findMany({
        columns: {
          id: true,
          text: true,
          createdAt: true,
          score: true,
        },
        with: {
          author: {
            columns: {
              id: true,
              username: true,
              fullName: true,
              avatarPath: true,
            },
          },
          userRatings: {
            columns: { rating: true, appUserId: true },
          },
        },
        where: (t, { and, eq, isNull }) =>
          and(
            eq(t.uploadRecordId, input.mediaId),
            isNull(t.replyingToId), // Only top-level comments
          ),
        orderBy: (t, { desc }) => [desc(t.score)],
      });

      const commentIds = comments.map((c) => c.id);
      const replyCountRows =
        commentIds.length > 0
          ? await db
              .select({
                replyingToId: UploadUserComment.replyingToId,
                cnt: count(),
              })
              .from(UploadUserComment)
              .where(inArray(UploadUserComment.replyingToId, commentIds))
              .groupBy(UploadUserComment.replyingToId)
          : [];
      const replyCountMap = new Map(
        replyCountRows.map((r) => [r.replyingToId, Number(r.cnt)]),
      );

      return comments.map((comment) => {
        const likeCount = comment.userRatings.filter(
          (r) => r.rating === 'LIKE',
        ).length;
        const replyCount = replyCountMap.get(comment.id) ?? 0;
        const userRating = ctx.session
          ? (comment.userRatings.find(
              (r) => r.appUserId === ctx.session?.appUserId,
            )?.rating ?? null)
          : null;

        return {
          id: OutgoingIdSchema.parse(comment.id),
          text: comment.text,
          createdAt: comment.createdAt,
          score: comment.score,
          author: {
            ...comment.author,
            id: OutgoingIdSchema.parse(comment.author.id),
          },
          userRating,
          likeCount,
          replyCount,
        };
      });
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

      const sessionUserId = ctx.session?.appUserId ?? null;
      const parentComment = await db.query.UploadUserComment.findFirst({
        columns: { id: true },
        with: {
          upload: {
            columns: { visibility: true },
            with: {
              channel: {
                columns: { id: true, visibility: true, approvedAt: true },
              },
            },
          },
        },
        where: (t, { eq }) => eq(t.id, input.commentId),
      });

      if (!parentComment) return [];

      const { upload } = parentComment;

      if (
        upload.channel.visibility === 'PRIVATE' ||
        !upload.channel.approvedAt
      ) {
        return [];
      }

      if (upload.visibility === 'PRIVATE') {
        if (!sessionUserId) return [];
        if (!ctx.isSiteAdmin) {
          const membershipCheck = await db.query.ChannelMembership.findFirst({
            columns: { appUserId: true },
            where: (t, { and, eq }) =>
              and(
                eq(t.channelId, upload.channel.id),
                eq(t.appUserId, sessionUserId),
              ),
          });
          if (!membershipCheck) return [];
        }
      }

      const replies = await db.query.UploadUserComment.findMany({
        columns: {
          id: true,
          text: true,
          createdAt: true,
          score: true,
        },
        with: {
          author: {
            columns: {
              id: true,
              username: true,
              fullName: true,
              avatarPath: true,
            },
          },
          userRatings: {
            columns: { rating: true, appUserId: true },
          },
        },
        where: (t, { eq }) => eq(t.replyingToId, input.commentId),
        orderBy: (t, { asc }) => [asc(t.createdAt)],
      });

      return replies.map((reply) => {
        const likeCount = reply.userRatings.filter(
          (r) => r.rating === 'LIKE',
        ).length;
        const userRating = ctx.session
          ? (reply.userRatings.find(
              (r) => r.appUserId === ctx.session?.appUserId,
            )?.rating ?? null)
          : null;

        return {
          id: OutgoingIdSchema.parse(reply.id),
          text: reply.text,
          createdAt: reply.createdAt,
          score: reply.score,
          author: {
            ...reply.author,
            id: OutgoingIdSchema.parse(reply.author.id),
          },
          userRating,
          likeCount,
        };
      });
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
      const upload = await db.query.UploadRecord.findFirst({
        columns: {
          id: true,
          visibility: true,
        },
        with: {
          channel: {
            columns: {
              id: true,
              visibility: true,
            },
          },
        },
        where: (t, { eq }) => eq(t.id, mediaId),
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
        const membership = await db.query.ChannelMembership.findFirst({
          columns: { channelId: true },
          where: (t, { and, eq }) =>
            and(eq(t.channelId, upload.channel.id), eq(t.appUserId, userId)),
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

      const [comment] = await db
        .insert(UploadUserComment)
        .values({
          uploadRecordId: mediaId,
          authorId: userId,
          text,
          replyingToId,
          updatedAt: new Date(),
          score: 0,
        })
        .returning({
          id: UploadUserComment.id,
          text: UploadUserComment.text,
          createdAt: UploadUserComment.createdAt,
          score: UploadUserComment.score,
          authorId: UploadUserComment.authorId,
        });

      // Fetch the author info
      const author = await db.query.AppUser.findFirst({
        columns: {
          id: true,
          username: true,
          fullName: true,
          avatarPath: true,
        },
        where: (t, { eq }) => eq(t.id, userId),
      });

      if (!comment) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      }

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
          id: OutgoingIdSchema.parse(author?.id),
          username: author?.username,
          fullName: author?.fullName,
          avatarPath: author?.avatarPath,
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
      const existingRating = await db.query.UploadUserCommentRating.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.appUserId, userId), eq(t.uploadUserCommentId, commentId)),
      });

      if (existingRating) {
        if (existingRating.rating === rating) {
          // User is clicking the same rating - remove it (toggle off)
          await db
            .delete(UploadUserCommentRating)
            .where(
              and(
                eq(UploadUserCommentRating.appUserId, userId),
                eq(UploadUserCommentRating.uploadUserCommentId, commentId),
              ),
            );

          moduleLogger.info('Comment rating removed');

          return {
            userRating: null,
            previousRating: rating,
          };
        } else {
          // User is changing their rating
          await db
            .update(UploadUserCommentRating)
            .set({ rating })
            .where(
              and(
                eq(UploadUserCommentRating.appUserId, userId),
                eq(UploadUserCommentRating.uploadUserCommentId, commentId),
              ),
            );

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
        await db.insert(UploadUserCommentRating).values({
          appUserId: userId,
          uploadUserCommentId: commentId,
          rating,
        });

        moduleLogger.info('New comment rating created');

        return {
          userRating: rating,
          previousRating: null,
        };
      }
    }),
};
