import {
  Annotation,
  ChannelSubscription,
  db,
  TranscriptParagraph,
  UploadList,
  UploadListEntry,
  UploadRecord,
  UploadUserComment,
  UploadUserCommentRating,
  UploadUserRating,
  UploadView,
  UploadViewSecond,
  UploadViewSource,
} from '@letschurch/db';
import { osSearch } from '@letschurch/opensearch';
import { getPublicUrlWithFilename } from '@letschurch/s3';
import { publicS3 } from '@letschurch/s3/public';
import { xxh64 } from '@node-rs/xxhash';
import { getRequest } from '@tanstack/react-start/server';
import { TRPCError } from '@trpc/server';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeStringify from 'rehype-stringify';
import remarkLinkify from 'remark-linkify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { type NodeCue, parseSync as parseVtt } from 'subtitle';
import { unified } from 'unified';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarXs2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { canViewMediaById } from '@/util/media-visibility';
import { getMuxLivePlaybackUrl } from '@/util/mux';
import { getClientIpAddress } from '@/util/request-ip';
import { isSafeUrl } from '@/util/safe-url';
import {
  getPublicImageUrl,
  getPublicMediaUrl,
  makeDownloadServiceUrl,
} from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { ffprobeSchema } from '@/util/zod';
import { generateSuggestedQuestions } from '../media/suggested-questions';
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

// Markdown is rendered to HTML and injected with dangerouslySetInnerHTML on the
// public media page. remark-rehype drops raw HTML, but Markdown links are still
// turned into <a href>, and the default URL handling does not reject
// `javascript:`/`data:`/`vbscript:` schemes — so `[click](javascript:alert(1))`
// would render as an executable href. Strip unsafe url-bearing attributes here.
const URL_ATTRS = ['href', 'src'] as const;

function walkSafeUrls(node: AnyNode): void {
  if (node.properties) {
    for (const attr of URL_ATTRS) {
      const value = node.properties[attr];
      if (typeof value === 'string' && !isSafeUrl(value)) {
        delete node.properties[attr];
      }
    }
  }
  if (node.children) {
    for (const child of node.children) {
      walkSafeUrls(child);
    }
  }
}

function rehypeSafeUrls() {
  return (tree: AnyNode) => walkSafeUrls(tree);
}

const md = unified()
  .use(remarkLinkify)
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeExternalLinks, {
    rel: ['nofollow', 'noopener', 'noreferrer'],
    target: '_blank',
  })
  .use(rehypeTimestamps)
  .use(rehypeSafeUrls)
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

const getRelatedMediaSchema = z.object({
  mediaId: IncomingIdSchema,
  limit: z.number().min(1).max(24).default(12),
});

export const mediaProcedures = {
  // Starter questions for the media-page "ask about this video" dropdown.
  // Generation is cached in Valkey (per upload), so it's fetched on page load
  // (pre-generated) and returns instantly thereafter without per-view cost.
  getSuggestedQuestions: publicProcedure
    .input(z.object({ mediaId: IncomingIdSchema }))
    .query(async ({ input, ctx }) => {
      // Gate on the same visibility rules as every other media read: without
      // this, an anonymous caller who knows a PRIVATE/unapproved/deleted upload
      // id could read its title/description/summary (echoed in the generated
      // questions) and drive a paid LLM generation for media they can't view.
      if (!(await canViewMediaById(input.mediaId, ctx))) {
        return [];
      }
      const media = await db.query.UploadRecord.findFirst({
        columns: { id: true, title: true, description: true, summary: true },
        where: (t, { eq: eqOp }) => eqOp(t.id, input.mediaId),
      });
      if (!media) return [];
      return generateSuggestedQuestions(
        media.id,
        media.title,
        media.description,
        media.summary,
      );
    }),

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
          probe: true,
          userCommentsEnabled: true,
          downloadsEnabled: true,
          license: true,
          transcribingFinishedAt: true,
          visibility: true,
          // Live broadcast fields. While `isLiveBroadcast` is set and the CDN
          // variants haven't landed yet, the player streams Mux's live HLS via
          // `muxPlaybackId`; afterwards it falls through to our CDN.
          isLiveBroadcast: true,
          muxPlaybackId: true,
          liveStartedAt: true,
          liveEndedAt: true,
          // LLM-generated display summary (Summary tab). Null until the
          // post-transcript summarize-upload activity has run for this upload.
          summary: true,
          // Per-section descriptions keyed to OUTLINE annotation IDs.
          // Joined to those annotations + their paragraph start time below
          // to produce the YouTube-style outline panel.
          sections: true,
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

      // Return null (rather than throwing) for anything the caller can't view
      // so the route loader renders an in-page "not found" instead of a 500.
      // UNLISTED media and media from UNLISTED channels stay viewable by direct
      // link — only PRIVATE/unapproved cases are gated here.
      if (!media) {
        return null;
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
        return null;
      }

      // Check if upload itself is private
      if (media.visibility === 'PRIVATE') {
        if (!sessionUserId) {
          return null;
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
            return null;
          }
        }
      }

      const {
        defaultThumbnailPath,
        overrideThumbnailPath,
        channel,
        variants,
        downloadsEnabled,
        transcribingFinishedAt,
        isLiveBroadcast,
        muxPlaybackId,
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

      // A live broadcast plays Mux's HLS until our CDN variants land (i.e. the
      // recording has been imported + transcoded). Once `variants` are
      // populated the record behaves like any other VOD and we serve our own
      // CDN — a seamless swap with no change to the player/URL contract.
      const servingMux = isLiveBroadcast && !hasVideo && Boolean(muxPlaybackId);
      // Only "actively live" (moving edge, no end recorded) gets the live
      // treatment — LIVE badge, hidden scrubber. Once the broadcast ends but
      // before our CDN is ready, Mux serves the finite recording, which is
      // normally seekable, so we let the player behave like VOD.
      const isActivelyLive =
        servingMux && Boolean(media.liveStartedAt) && !media.liveEndedAt;

      const mediaSource = servingMux
        ? getMuxLivePlaybackUrl(muxPlaybackId as string)
        : hasVideo
          ? getPublicMediaUrl(`${media.id}/master.m3u8`)
          : null;

      const audioSource =
        !servingMux && hasAudio
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
        outlineRows,
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
        // OUTLINE annotations + paragraph start times for this upload, used
        // alongside `media.sections` below to build the YouTube-style outline
        // panel. Empty array when annotate hasn't run yet — the panel just
        // doesn't render. Ordered by paragraph order so the LAG step further
        // down can derive each section's end timestamp from the next start.
        db
          .select({
            id: Annotation.id,
            metadata: Annotation.metadata,
            start: TranscriptParagraph.start,
            order: TranscriptParagraph.order,
          })
          .from(Annotation)
          .innerJoin(
            TranscriptParagraph,
            eq(Annotation.paragraphId, TranscriptParagraph.id),
          )
          .where(
            and(
              eq(TranscriptParagraph.uploadRecordId, media.id),
              eq(Annotation.kind, 'OUTLINE'),
            ),
          )
          .orderBy(TranscriptParagraph.order),
      ]);

      const isFollowing = !!subscription;
      const isSaved = !!savedMedia;
      const canEdit =
        ctx.isSiteAdmin || !!(membership?.isAdmin || membership?.canEdit);
      const viewCount = viewCountResult?.count ?? 0;
      const subscriberCount = Number(subscriberCountResult?.count ?? 0);

      // Assemble the YouTube-style outline panel data: one entry per OUTLINE
      // annotation, matched to its per-section description from
      // `upload_record.sections` by annotation id. `endSeconds` is the next
      // section's start (or media length for the last); the UI uses it for
      // the timestamp range label. Sections without a matching description
      // (model hallucinated an id, or a re-annotate ran after summarize)
      // are surfaced anyway with a null description so the chapter list
      // stays correct.
      const sectionDescriptionById = new Map(
        (mediaRest.sections ?? []).map((s) => [s.id, s.description]),
      );
      const outline = outlineRows.map((row, i) => {
        const next = outlineRows[i + 1];
        const endSeconds = next
          ? next.start
          : (mediaRest.lengthSeconds ?? row.start);
        const meta = row.metadata as { title?: unknown; level?: unknown };
        const title =
          typeof meta.title === 'string' ? meta.title : 'Untitled section';
        return {
          id: OutgoingIdSchema.parse(row.id),
          title,
          startSeconds: row.start,
          endSeconds,
          description: sectionDescriptionById.get(row.id) ?? null,
        };
      });

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
        const downloadPromises: Array<Promise<void>> = [];

        // Signed download service URLs (HLS transcoded to MP4/m4a on the fly)
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
        const highQualityVideoEntries = availableVideoResolutionEntries.filter(
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
          if (!variants.includes(entry.variant as (typeof variants)[number])) {
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

      const { sections: _sections, ...mediaRestNoSections } = mediaRest;

      return {
        ...mediaRestNoSections,
        descriptionHtml,
        id: OutgoingIdSchema.parse(mediaRest.id),
        thumbnailUrl,
        fullSizeThumbnailUrl,
        posterThumbnailUrl,
        mediaSource,
        audioSource,
        // `isLiveBroadcast` marks the record as a broadcast. `servingMux` is
        // true whenever we're still playing Mux (live or the post-stream
        // recording, before our CDN is ready). `isLive` is true only while
        // actively broadcasting (moving edge).
        isLiveBroadcast,
        servingMux,
        isLive: isActivelyLive,
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
        outline,
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

      // Only record views for media the caller can actually view. Otherwise an
      // arbitrary upload id could be planted into the caller's history/progress
      // (and later read back through library/home endpoints).
      if (!(await canViewMediaById(uploadRecordId, ctx))) {
        return null;
      }

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
        // Accepted for backward compatibility with the player, but IGNORED: the
        // dedup hash is derived server-side below, never trusted from the client.
        viewHash: z.string().optional(),
        ranges: z
          .array(
            z.object({
              start: z.number().finite().nonnegative(),
              end: z.number().finite().nonnegative(),
            }),
          )
          // Bound the request so a caller can't submit a huge range set and
          // force unbounded second-by-second expansion + row inserts.
          .max(1000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { uploadRecordId, ranges } = input;
      const clientIp = getClientIpAddress(getRequest().headers);
      const clientUserAgent = getRequest().headers.get('user-agent');

      moduleLogger.info(
        {
          context: {
            rangeCount: ranges.length,
          },
        },
        'Recording view seconds',
      );

      // Don't seed view/progress rows for media the caller can't view.
      if (!(await canViewMediaById(uploadRecordId, ctx))) {
        return { success: false, secondsRecorded: 0 };
      }

      // Derive the view hash server-side from the authenticated principal (or
      // ip+user-agent) and the current daily salt. NEVER trust a client-supplied
      // viewHash: that would let a caller forge arbitrary dedup keys to inflate
      // the public view count and amplify UploadViewSecond inserts. This mirrors
      // createUploadView exactly, so the derived hash matches the parent
      // UploadView row for the same viewer/day.
      const trackingSalt = await db.query.TrackingSalt.findFirst({
        orderBy: (t, { desc }) => [desc(t.id)],
      });
      if (!trackingSalt || !clientUserAgent) {
        return { success: false, secondsRecorded: 0 };
      }
      const viewHashBigInt = u64ToSigned(
        xxh64(
          ctx.session?.appUserId ?? `${clientIp ?? ''}${clientUserAgent}`,
          BigInt(trackingSalt.salt),
        ),
      );

      // Cap the total number of expanded seconds so a few very large ranges
      // can't allocate an unbounded Set / insert batch (24h of seconds is far
      // beyond any real media length).
      const MAX_SECONDS = 86_400;

      // Convert ranges to individual seconds
      const seconds = new Set<number>();
      for (const range of ranges) {
        if (range.end < range.start) {
          continue;
        }
        const startSecond = Math.floor(range.start);
        const endSecond = Math.floor(range.end);
        for (let second = startSecond; second <= endSecond; second++) {
          seconds.add(second);
          if (seconds.size >= MAX_SECONDS) {
            break;
          }
        }
        if (seconds.size >= MAX_SECONDS) {
          break;
        }
      }

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

      const paragraphRows = await db.query.TranscriptParagraph.findMany({
        columns: {
          id: true,
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

      if (paragraphRows.length === 0) return null;

      // No Drizzle `relations()` is defined for TranscriptParagraph ↔
      // Annotation; a second findMany + JS group-by avoids introducing
      // relations just for this read path. One DB query, indexed by
      // `annotation_paragraph_kind_idx`.
      const annotationRows = await db.query.Annotation.findMany({
        columns: {
          id: true,
          paragraphId: true,
          kind: true,
          startWord: true,
          endWord: true,
          metadata: true,
        },
        where: (t, { inArray: inA }) =>
          inA(
            t.paragraphId,
            paragraphRows.map((p) => p.id),
          ),
      });
      // `{ [key: string]: {} }` (vs `Record<string, unknown>`): tRPC's
      // queryOptions inference normalizes `unknown` to `{}` (non-null
      // object) when computing the queryFn's data type, so the loader
      // and component see the narrowed form. Matching it here keeps the
      // procedure's return assignable to TanStack's loader-return slot
      // — without it, the `ensureQueryData(...)` result type drifts
      // from the declared loader-data type and the route fails to
      // typecheck with "two different types with this name exist".
      type AnnotationOut = {
        kind: (typeof annotationRows)[number]['kind'];
        startWord: number | null;
        endWord: number | null;
        // biome-ignore lint/complexity/noBannedTypes: see comment above — TanStack/tRPC inference uses `{}` for the JSON-safe metadata shape; matching here keeps the loader contract aligned.
        metadata: { [key: string]: {} };
      };
      const annotationsByParagraphId = new Map<string, Array<AnnotationOut>>();
      for (const a of annotationRows) {
        const list = annotationsByParagraphId.get(a.paragraphId) ?? [];
        list.push({
          kind: a.kind,
          startWord: a.startWord,
          endWord: a.endWord,
          // biome-ignore lint/complexity/noBannedTypes: see AnnotationOut type comment.
          metadata: a.metadata as { [key: string]: {} },
        });
        annotationsByParagraphId.set(a.paragraphId, list);
      }
      // Stable order: nulls first (OUTLINE), then ascending by startWord.
      // Gives the renderer a deterministic span iteration that mirrors
      // reading order.
      for (const list of annotationsByParagraphId.values()) {
        list.sort((a, b) => {
          const aw = a.startWord ?? -1;
          const bw = b.startWord ?? -1;
          return aw - bw;
        });
      }

      // Resolve each paragraph's NAMED speaker: per-paragraph override label ??
      // diarization label → speaker_attribution → Speaker.name. Lets the
      // transcript surface a real name + a "more from this speaker" link; null
      // when the voice isn't attributed to a (non-deleted) named speaker.
      const paragraphIds = paragraphRows.map((p) => p.id);
      const [overrideRows, attributionRows] = await Promise.all([
        db.query.SpeakerParagraphLabel.findMany({
          columns: { paragraphId: true, label: true },
          where: (t, { inArray: inA }) => inA(t.paragraphId, paragraphIds),
        }),
        db.query.SpeakerAttribution.findMany({
          columns: { speakerLabel: true },
          where: (t, { eq }) => eq(t.uploadRecordId, input.mediaId),
          with: { speaker: { columns: { name: true, deletedAt: true } } },
        }),
      ]);
      const overrideByParagraph = new Map(
        overrideRows.map((o) => [o.paragraphId, o.label]),
      );
      const nameByLabel = new Map<string, string>();
      for (const a of attributionRows) {
        if (a.speaker && a.speaker.deletedAt === null) {
          nameByLabel.set(a.speakerLabel, a.speaker.name);
        }
      }

      return paragraphRows.map(({ id, ...rest }) => {
        const effectiveLabel = overrideByParagraph.get(id) ?? rest.speaker;
        const speakerName = effectiveLabel
          ? (nameByLabel.get(effectiveLabel) ?? null)
          : null;
        return {
          ...rest,
          speakerName,
          annotations: annotationsByParagraphId.get(id) ?? [],
        };
      });
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

      // Don't allow rating media the caller can't view (private/unapproved/
      // deleted), which would otherwise let anyone manipulate engagement on
      // media they have no access to.
      if (!(await canViewMediaById(mediaId, ctx))) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Media not found' });
      }

      // Check if user already rated this media
      const existingRating = await db.query.UploadUserRating.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.appUserId, userId), eq(t.uploadRecordId, mediaId)),
      });

      type RatingValue = 'LIKE' | 'DISLIKE' | null;
      let result: { userRating: RatingValue; previousRating: RatingValue };

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

          result = { userRating: null, previousRating: rating };
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

          result = {
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

        result = { userRating: rating, previousRating: null };
      }

      // Any rating change affects the upload's score. Re-mark it stale so the
      // background score worker recomputes it — the worker clears scoreStaleAt
      // after each pass, so without re-staling here, ratings made after the
      // first pass would never be reflected in the trending score.
      await db
        .update(UploadRecord)
        .set({ scoreStaleAt: new Date() })
        .where(eq(UploadRecord.id, mediaId));

      return result;
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

      // Don't expose engagement counts for media the caller can't view.
      if (!(await canViewMediaById(input.mediaId, ctx))) {
        return { likes: 0, dislikes: 0, userRating: null };
      }

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
          userCommentsEnabled: true,
          deletedAt: true,
        },
        with: {
          channel: {
            columns: {
              id: true,
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
          },
        },
        where: (t, { eq }) => eq(t.id, mediaId),
      });

      if (!upload || upload.deletedAt || upload.channel.deletedAt) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Media not found' });
      }

      // Respect the per-upload comments toggle (server-side, not just the UI).
      if (!upload.userCommentsEnabled) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Comments are disabled for this media',
        });
      }

      // Check authorization based on channel and upload visibility. Unapproved
      // channels are treated like private (membership required) so comments
      // can't be attached to not-yet-public media.
      const needsChannelMembership =
        upload.channel.visibility === 'PRIVATE' ||
        !upload.channel.approvedAt ||
        upload.visibility === 'PRIVATE';

      if (needsChannelMembership) {
        // Check if user is a member of the channel
        const membership = await db.query.ChannelMembership.findFirst({
          columns: { channelId: true },
          where: (t, { and, eq }) =>
            and(eq(t.channelId, upload.channel.id), eq(t.appUserId, userId)),
        });

        if (!membership) {
          moduleLogger.warn('Unauthorized comment attempt');
          throw new TRPCError({
            code: 'FORBIDDEN',
            message:
              'You must be a member of the channel to comment on this media',
          });
        }
      }

      // If this is a reply, the parent comment must belong to the same media.
      // Otherwise a reply could be attached under another upload's comment
      // thread (and surfaced there via getReplies).
      if (replyingToId) {
        const parent = await db.query.UploadUserComment.findFirst({
          columns: { uploadRecordId: true },
          where: (t, { eq }) => eq(t.id, replyingToId),
        });

        if (!parent || parent.uploadRecordId !== mediaId) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Parent comment not found for this media',
          });
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

      // The caller must be able to view the comment's media before rating it.
      const comment = await db.query.UploadUserComment.findFirst({
        columns: { uploadRecordId: true },
        where: (t, { eq }) => eq(t.id, commentId),
      });

      if (!comment || !(await canViewMediaById(comment.uploadRecordId, ctx))) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Comment not found',
        });
      }

      // Check if user already rated this comment
      const existingRating = await db.query.UploadUserCommentRating.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.appUserId, userId), eq(t.uploadUserCommentId, commentId)),
      });

      type RatingValue = 'LIKE' | 'DISLIKE' | null;
      let result: { userRating: RatingValue; previousRating: RatingValue };

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

          result = { userRating: null, previousRating: rating };
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

          result = {
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

        result = { userRating: rating, previousRating: null };
      }

      // Re-mark the comment's score stale so the background score worker
      // recomputes it; it clears scoreStaleAt after each pass, so later rating
      // changes would otherwise never affect comment ordering.
      await db
        .update(UploadUserComment)
        .set({ scoreStaleAt: new Date() })
        .where(eq(UploadUserComment.id, commentId));

      return result;
    }),

  getRelatedMedia: publicProcedure
    .input(getRelatedMediaSchema)
    .query(async ({ input, ctx }) => {
      const { mediaId, limit } = input;
      const empty = { sameChannel: [], otherChannels: [] };

      // Pull the current upload's summary embedding from Postgres (the source
      // of truth for the vector). Null until the summarize-upload activity has
      // run, in which case there's no related content to show yet.
      const current = await db.query.UploadRecord.findFirst({
        columns: { summaryEmbedding: true, channelId: true, visibility: true },
        with: {
          channel: {
            columns: { id: true, visibility: true, approvedAt: true },
          },
        },
        where: (t, { eq }) => eq(t.id, mediaId),
      });

      if (!current) {
        return empty;
      }

      // Mirror the access checks used by getMediaById/getTranscript: the caller
      // must be able to view the source media before we surface anything
      // derived from it (its embedding, even indirectly).
      if (
        current.channel.visibility === 'PRIVATE' ||
        !current.channel.approvedAt
      ) {
        return empty;
      }

      if (current.visibility === 'PRIVATE') {
        const sessionUserId = ctx.session?.appUserId ?? null;
        if (!sessionUserId) return empty;
        if (!ctx.isSiteAdmin) {
          const membershipCheck = await db.query.ChannelMembership.findFirst({
            columns: { appUserId: true },
            where: (t, { and, eq }) =>
              and(
                eq(t.channelId, current.channel.id),
                eq(t.appUserId, sessionUserId),
              ),
          });
          if (!membershipCheck) return empty;
        }
      }

      const queryVector = current.summaryEmbedding;

      if (!queryVector || queryVector.length === 0) {
        return empty;
      }

      const { channelId } = current;

      // Over-fetch a few extra neighbors so post-filtering against the DB
      // (visibility / approval / transcoding state) can still yield `limit`.
      const k = limit + 5;

      // Run two kNN searches over the same summary vector: one restricted to
      // this channel ("More from <Channel>"), one excluding it ("Other Related
      // Content"). Same access-control constraints + kNN params on both; only
      // the channel clause differs.
      const knnByChannel = (sameChannel: boolean) =>
        osSearch({
          index: 'lc_media_v1',
          _source: false,
          size: k,
          // OpenSearch knn query: vector + k + an optional `filter` query that
          // restricts which parent docs are eligible (efficient filtering).
          query: {
            knn: {
              summaryEmbedding: {
                vector: queryVector,
                k,
                filter: {
                  bool: {
                    must: [
                      { term: { visibility: 'PUBLIC' } },
                      { term: { channelVisibility: 'PUBLIC' } },
                      { exists: { field: 'channelApprovedAt' } },
                      { exists: { field: 'transcodingFinishedAt' } },
                      { exists: { field: 'transcribingFinishedAt' } },
                      ...(sameChannel ? [{ term: { channelId } }] : []),
                    ],
                    // Same channel excludes the current upload; cross-channel
                    // excludes the whole channel (which excludes it too).
                    must_not: sameChannel
                      ? [{ ids: { values: [mediaId] } }]
                      : [{ term: { channelId } }],
                  },
                },
              },
            },
          },
        });

      const [sameChannelRes, otherChannelsRes] = await Promise.all([
        knnByChannel(true),
        knnByChannel(false),
      ]);

      const hitIds = (res: Record<string, unknown>) =>
        (
          (res as { hits?: { hits?: Array<{ _id?: string }> } }).hits?.hits ??
          []
        )
          .map((hit) => hit._id)
          .filter((id): id is string => Boolean(id));

      const sameChannelIds = hitIds(sameChannelRes);
      const otherChannelIds = hitIds(otherChannelsRes);

      const allIds = Array.from(
        new Set([...sameChannelIds, ...otherChannelIds]),
      );

      if (allIds.length === 0) {
        return empty;
      }

      // Fetch full upload data from the database (Elasticsearch is the
      // relevance source of truth; the DB is the data source of truth).
      const uploads = await db.query.UploadRecord.findMany({
        where: (t, { inArray, and, isNotNull }) =>
          and(inArray(t.id, allIds), isNotNull(t.transcodingFinishedAt)),
        columns: {
          id: true,
          title: true,
          publishedAt: true,
          lengthSeconds: true,
          defaultThumbnailPath: true,
          overrideThumbnailPath: true,
        },
        with: {
          channel: {
            columns: {
              id: true,
              name: true,
              avatarPath: true,
              defaultThumbnailPath: true,
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
          },
        },
      });

      const uploadsMap = new Map(
        uploads
          .filter(
            (u) =>
              u.channel.visibility === 'PUBLIC' &&
              u.channel.approvedAt !== null &&
              u.channel.deletedAt === null,
          )
          .map((u) => [u.id, u]),
      );

      // Preserve Elasticsearch ordering (semantic similarity) and cap at limit.
      const buildList = (ids: Array<string>) =>
        ids
          .map((id) => uploadsMap.get(id))
          .filter((upload): upload is NonNullable<typeof upload> =>
            Boolean(upload),
          )
          .slice(0, limit)
          .map((upload) => {
            const { channel } = upload;

            const thumbnailUrl = resolveThumbnailUrl({
              overrideThumbnailPath: upload.overrideThumbnailPath,
              defaultThumbnailPath: upload.defaultThumbnailPath,
              channelDefaultThumbnailPath: channel.defaultThumbnailPath,
              size: 'card',
            });

            const channelAvatarUrl = channel.avatarPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(channel.avatarPath),
                  { resize: appAvatarXs2x },
                )
              : null;

            return {
              id: OutgoingIdSchema.parse(upload.id),
              title: upload.title,
              thumbnailUrl,
              channelName: channel.name,
              channelAvatarUrl,
              lengthSeconds: upload.lengthSeconds,
              publishedAt: upload.publishedAt,
            };
          });

      return {
        sameChannel: buildList(sameChannelIds),
        otherChannels: buildList(otherChannelIds),
      };
    }),
};
