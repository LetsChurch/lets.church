import { db, SearchLogEntry, UploadView } from '@letschurch/db';
import {
  type MediaSegment,
  MSearchResponseSchema,
  mergeParagraphSnippets,
  msearchChannels,
  msearchTranscripts,
  msearchUploads,
  osMsearch,
  runMediaChannelFacets,
  runMediaHybridSearch,
  runMediaKnnProbe,
} from '@letschurch/opensearch';
import { publicS3 } from '@letschurch/s3/public';
import {
  createEmbeddingsTracked,
  EMBED_MODEL,
} from '@letschurch/temporal/util/llm';
import { TRPCError } from '@trpc/server';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarSm2x, appAvatarXs2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { isChannelRoutable } from '@/util/media-visibility';
import { getPublicImageUrl } from '@/util/server-env';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { hydrateUploads } from '../search/hydrate';
import { extractQuotedPhrases, parseSearchQuery } from '../search/parse-query';
import { generateRelatedSearches } from '../search/related-searches';
import { authProcedure, publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/search',
});

// Whole-set relevance gate for hybrid results: when the best video's absolute
// cosine (recovered from the doc-level searchSummaryEmbedding kNN score as
// 2*score - 1) is below this floor, nothing in the library is actually on-topic,
// so we suppress the (semantically-vague) result list rather than show noise.
// Set a touch below the answer gate's 0.3 — showing a few related videos is less
// committal than asserting an answer. Tunable; the decision is logged.
const RESULTS_RELEVANCE_COSINE_FLOOR = 0.25;

// Cap on how many faceted channels are handed to the parser as grounding
// candidates for its channel suggestion (facets are doc_count-ordered).
const MAX_CANDIDATE_CHANNELS = 12;

const searchQuerySchema = z.object({
  q: z.string().min(1),
  focus: z.enum(['media', 'transcripts']).default('media'),
  channelIds: z.array(IncomingIdSchema).optional().nullable(),
  channelSlugs: z.array(z.string()).optional().nullable(),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.number().min(0).default(0), // Offset-based cursor
  sort: z.enum(['relevance', 'date-asc', 'date-desc']).optional(),
  dateRange: z
    .enum(['all-time', 'today', 'this-week', 'this-month', 'this-year'])
    .optional(),
  skipLogging: z.boolean().optional().default(false),
});

const uploadThumbnailSchema = z.object({
  uploadId: IncomingIdSchema,
});

// Accept only ISO-8601-parseable date strings (date-only "YYYY-MM-DD" or full
// timestamps) at the boundary, so a malformed value can't reach — and error —
// the OpenSearch `publishedAt` range query. Empty string is permitted: it's
// falsy downstream and treated as "no bound".
const isoDateString = z
  .string()
  .refine((s) => s.length === 0 || !Number.isNaN(Date.parse(s)), {
    message: 'Must be an ISO-8601 date string (e.g. "2024-01-31")',
  });

const hybridSearchSchema = z.object({
  q: z.string().min(1),
  channelIds: z.array(IncomingIdSchema).optional().nullable(),
  channelSlugs: z.array(z.string()).optional().nullable(),
  // Verbatim phrases (from the parser's `quotes`) to boost as phrase matches.
  quotes: z.array(z.string()).optional().nullable(),
  // Inclusive publish-date bounds (date-only, from the parser's `dates`).
  dateGte: isoDateString.optional().nullable(),
  dateLte: isoDateString.optional().nullable(),
  // Manual date-range filter from the UI (computed to a publishedAt range
  // server-side, same buckets as performSearch). Explicit dateGte/dateLte win.
  dateRange: z
    .enum(['all-time', 'today', 'this-week', 'this-month', 'this-year'])
    .optional(),
  // 'relevance' (default) keeps the fused RRF order; 'date-asc'/'date-desc'
  // order results by publishedAt (applied as a field sort on the hybrid query).
  sort: z.enum(['relevance', 'date-asc', 'date-desc']).optional(),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.number().min(0).default(0),
  skipLogging: z.boolean().optional().default(false),
});

// Map the UI's coarse date-range bucket to an absolute publishedAt range.
// Mirrors performSearch's switch so the two filters behave identically.
function dateRangeToPublishedAt(
  dateRange: string | undefined,
  now: Date,
): { gte: string; lte: string } | null {
  if (!dateRange || dateRange === 'all-time') return null;
  let startDate: Date;
  switch (dateRange) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'this-week':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'this-month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'this-year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      return null;
  }
  return { gte: startDate.toISOString(), lte: now.toISOString() };
}

// Resolve channel UUIDs to the display shape the carousel + facet filters use
// (outgoing id, name, slug, avatar). Order follows the input ids.
async function hydrateChannelsForDisplay(channelIds: string[]) {
  if (channelIds.length === 0) return [];
  const dbChannels = await db.query.Channel.findMany({
    where: (t, { inArray: inArr, eq: eqOp, and: andOp, isNotNull, isNull }) =>
      andOp(
        inArr(t.id, channelIds),
        eqOp(t.visibility, 'PUBLIC'),
        isNotNull(t.approvedAt),
        isNull(t.deletedAt),
      ),
    columns: { id: true, name: true, slug: true, avatarPath: true },
  });
  const byId = new Map(dbChannels.map((c) => [c.id, c]));
  return channelIds
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((channel) => ({
      ...channel,
      id: OutgoingIdSchema.parse(channel.id),
      avatarUrl: channel.avatarPath
        ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
            resize: appAvatarSm2x,
          })
        : null,
    }));
}

// Convert provided channel slugs to internal UUIDs (public + approved only).
async function channelSlugsToIds(slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const channels = await db.query.Channel.findMany({
    where: (t, { inArray: inArr, eq: eqOp, and: andOp, isNotNull, isNull }) =>
      andOp(
        inArr(t.slug, slugs),
        eqOp(t.visibility, 'PUBLIC'),
        isNotNull(t.approvedAt),
        isNull(t.deletedAt),
      ),
    columns: { id: true },
  });
  return channels.map((c) => c.id);
}

export const searchProcedures = {
  getUploadThumbnail: publicProcedure
    .input(uploadThumbnailSchema)
    .query(async ({ input }) => {
      const { uploadId } = input;

      const upload = await db.query.UploadRecord.findFirst({
        where: (t, { eq }) => eq(t.id, uploadId),
        columns: {
          overrideThumbnailPath: true,
          defaultThumbnailPath: true,
          visibility: true,
          deletedAt: true,
        },
        with: {
          channel: {
            columns: {
              defaultThumbnailPath: true,
              visibility: true,
              approvedAt: true,
              deletedAt: true,
            },
          },
        },
      });

      // Public endpoint: only resolve thumbnails for publicly-viewable media so
      // a known private/unapproved upload id can't leak its (or its channel's)
      // thumbnail URL.
      if (
        !upload ||
        upload.deletedAt ||
        upload.visibility === 'PRIVATE' ||
        !isChannelRoutable(upload.channel)
      ) {
        return null;
      }

      return resolveThumbnailUrl({
        overrideThumbnailPath: upload.overrideThumbnailPath,
        defaultThumbnailPath: upload.defaultThumbnailPath,
        channelDefaultThumbnailPath: upload.channel.defaultThumbnailPath,
        size: 'featured',
      });
    }),

  performSearch: publicProcedure
    .input(searchQuerySchema)
    .query(async ({ input, ctx }) => {
      const {
        q,
        focus,
        channelIds: inputChannelIds,
        channelSlugs,
        limit,
        cursor,
        sort,
        dateRange,
        skipLogging,
      } = input;

      // Convert channel slugs to IDs if provided
      let channelIds = inputChannelIds;
      if (channelSlugs && channelSlugs.length > 0) {
        const channels = await db.query.Channel.findMany({
          where: (t, { inArray, eq, and, isNotNull }) =>
            and(
              inArray(t.slug, channelSlugs),
              eq(t.visibility, 'PUBLIC'),
              isNotNull(t.approvedAt),
            ),
          columns: { id: true },
        });
        // Post-filter for deletedAt: null
        channelIds = channels.map((c) => c.id);

        moduleLogger.info(
          {
            context: {
              slugsProvided: channelSlugs.length,
              channelsFound: channels.length,
            },
          },
          'Converted channel slugs to IDs',
        );
      }

      moduleLogger.info(
        {
          context: {
            query: q,
          },
        },
        'Performing search',
      );

      // Convert sort to orderBy for elasticsearch
      const orderBy =
        sort === 'date-asc'
          ? 'date'
          : sort === 'date-desc'
            ? 'dateDesc'
            : undefined;

      // Convert dateRange to publishedAt range
      const now = new Date();
      let publishedAt: { gte?: string; lte?: string } | undefined;

      if (dateRange && dateRange !== 'all-time') {
        const endDate = now.toISOString();
        let startDate: Date;

        switch (dateRange) {
          case 'today':
            startDate = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
            );
            break;
          case 'this-week':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'this-month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'this-year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
          default:
            startDate = new Date(0); // Beginning of time
        }

        publishedAt = {
          gte: startDate.toISOString(),
          lte: endDate,
        };

        moduleLogger.info(
          {
            context: {
              startDate: startDate.toISOString(),
            },
          },
          'Applied date range filter',
        );
      }

      // We'll log the search after getting results to capture counts
      let searchLogEntryId: string | null = null;

      // Determine which index to focus on and which to get metadata only
      const mediaLimit = focus === 'media' ? limit : 0;
      const transcriptLimit = focus === 'transcripts' ? limit : 0;

      // Prepare multisearch body
      const searches = [
        ...msearchUploads(q, cursor, mediaLimit, {
          channelIds,
          publishedAt,
          orderBy,
        }),
        ...msearchTranscripts(q, cursor, transcriptLimit, {
          channelIds,
          publishedAt,
          orderBy,
        }),
        ...msearchChannels(q, 0, 10), // Channel search results for carousel
      ];

      // Perform the multisearch
      moduleLogger.info(
        {
          context: {
            searchCount: searches.length / 2, // Each search has header + body
            channelsLimit: 10,
          },
        },
        'Executing ElasticSearch multisearch',
      );

      const response = await osMsearch(searches);

      // Parse and validate the response
      const parsed = MSearchResponseSchema.parse(response);

      moduleLogger.info(
        {
          context: {
            responseCount: parsed.responses.length,
          },
        },
        'ElasticSearch multisearch completed',
      );

      const [uploadsResponse, transcriptsResponse, channelsResponse] =
        parsed.responses;

      // Extract counts
      const mediaCount = uploadsResponse?.hits.total.value ?? 0;
      const transcriptCount = transcriptsResponse?.hits.total.value ?? 0;

      moduleLogger.info('Search result counts');

      // Log the search with result counts
      try {
        // Determine if we should skip logging
        const isAdmin = ctx.session?.appUser?.role === 'ADMIN';
        const shouldSkipLogging = skipLogging && isAdmin;

        // Only log if query is not empty or whitespace AND this is the initial search (not pagination)
        // AND we're not skipping logging (admin viewing search logs)
        if (q.trim().length > 0 && cursor === 0 && !shouldSkipLogging) {
          const logEntry = await db
            .insert(SearchLogEntry)
            .values({
              query: q,
              params: {
                focus,
                channelIds: channelIds ?? [],
                limit,
                cursor,
                sort,
                dateRange,
              },
              appUserId: ctx.session?.appUserId ?? null,
              mediaCount,
              transcriptCount,
              channelCount: 0, // Will be updated after we fetch channels
            })
            .returning()
            .then((r) => {
              const result = r[0];
              if (!result) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
              }
              return result;
            });

          searchLogEntryId = logEntry.id;

          moduleLogger.info(
            {
              context: {
                userId: ctx.session?.appUserId,
                searchLogId: searchLogEntryId,
              },
            },
            'Search query logged to database',
          );
        } else if (shouldSkipLogging) {
          moduleLogger.debug(
            {
              context: {
                userId: ctx.session?.appUserId,
                query: q,
              },
            },
            'Skipping search logging for admin user',
          );
        }
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to log search',
        );
        // Don't fail the search if logging fails
      }

      // Extract channel IDs from channel search results (for carousel)
      const channelIdsFromSearch = channelsResponse?.hits.hits
        .filter((hit) => hit._index === 'lc_channels')
        .map((hit) => hit._id);

      // Extract channel IDs from aggregations (facets) for filters
      const activeResponse =
        focus === 'transcripts' ? transcriptsResponse : uploadsResponse;
      const channelBuckets =
        activeResponse?.aggregations?.channelIds?.buckets ?? [];
      const facetedChannelIds = channelBuckets.map((bucket) => bucket.key);

      moduleLogger.info(
        {
          context: {
            channelSearchResults: channelIdsFromSearch.length,
            facetedChannels: facetedChannelIds.length,
            focus,
          },
        },
        'Extracted channel search results and facets',
      );

      // Combine both sets of channel IDs to fetch in one query
      const allChannelIds = Array.from(
        new Set([...channelIdsFromSearch, ...facetedChannelIds]),
      );

      // Get channel data from database
      const dbChannels =
        allChannelIds.length > 0
          ? await db.query.Channel.findMany({
              where: (t, { inArray, eq, and, isNotNull, isNull }) =>
                and(
                  inArray(t.id, allChannelIds),
                  eq(t.visibility, 'PUBLIC'),
                  isNotNull(t.approvedAt),
                  isNull(t.deletedAt),
                ),
              columns: {
                id: true,
                name: true,
                slug: true,
                avatarPath: true,
              },
            })
          : [];

      const dbChannelsMap = new Map(dbChannels.map((c) => [c.id, c]));

      // Process channel search results for carousel
      const channelsWithAvatars = channelIdsFromSearch
        .map((id) => dbChannelsMap.get(id))
        .filter((channel): channel is NonNullable<typeof channel> =>
          Boolean(channel),
        )
        .map((channel) => {
          const avatarUrl = channel.avatarPath
            ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
                resize: appAvatarSm2x,
              })
            : null;

          return {
            ...channel,
            id: OutgoingIdSchema.parse(channel.id),
            avatarUrl,
          };
        });

      // Process faceted channels for filters
      const facetedChannelsWithAvatars = facetedChannelIds
        .map((id) => dbChannelsMap.get(id))
        .filter((channel): channel is NonNullable<typeof channel> =>
          Boolean(channel),
        )
        .map((channel) => {
          const avatarUrl = channel.avatarPath
            ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
                resize: appAvatarSm2x,
              })
            : null;

          return {
            ...channel,
            id: OutgoingIdSchema.parse(channel.id),
            avatarUrl,
          };
        });

      moduleLogger.info(
        {
          context: {
            channelSearchResults: channelIdsFromSearch.length,
            channelsFound: channelsWithAvatars.length,
          },
        },
        'Fetched channel search data',
      );

      // Update the search log entry with channel count (only if we logged this search)
      if (searchLogEntryId) {
        try {
          await db
            .update(SearchLogEntry)
            .set({
              channelCount: channelsWithAvatars.length,
            })
            .where(eq(SearchLogEntry.id, searchLogEntryId));
        } catch (error) {
          moduleLogger.error(
            {
              context: {
                error: error instanceof Error ? error.message : String(error),
              },
            },
            'Failed to update search log channel count',
          );
        }
      }

      // Process results based on focus
      let items: Array<unknown> = [];

      if (focus === 'media' && uploadsResponse) {
        // Get upload IDs from hits
        const uploadIds = uploadsResponse.hits.hits
          .filter((hit) => hit._index === 'lc_uploads_v2')
          .map((hit) => hit._id);

        moduleLogger.info(
          {
            context: {
              hitsFromElasticsearch: uploadIds.length,
            },
          },
          'Processing media search results',
        );

        // Fetch full upload data from database
        const [uploads, viewCountRows] =
          uploadIds.length > 0
            ? await Promise.all([
                db.query.UploadRecord.findMany({
                  where: (t, { inArray, and, isNotNull }) =>
                    and(
                      inArray(t.id, uploadIds),
                      isNotNull(t.transcodingFinishedAt),
                    ),
                  columns: {
                    id: true,
                    title: true,
                    description: true,
                    createdAt: true,
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
                        slug: true,
                        avatarPath: true,
                        defaultThumbnailPath: true,
                        visibility: true,
                        approvedAt: true,
                      },
                    },
                  },
                }),
                db
                  .select({
                    uploadRecordId: UploadView.uploadRecordId,
                    cnt: count(),
                  })
                  .from(UploadView)
                  .where(inArray(UploadView.uploadRecordId, uploadIds))
                  .groupBy(UploadView.uploadRecordId),
              ])
            : [[], [] as { uploadRecordId: string; cnt: number }[]];
        const viewCountMap = new Map(
          viewCountRows.map((r) => [r.uploadRecordId, Number(r.cnt)]),
        );

        // Filter to public approved channels
        const filteredUploads = uploads.filter(
          (u) =>
            u.channel.visibility === 'PUBLIC' && u.channel.approvedAt !== null,
        );

        // Create a map for quick lookup
        const uploadsMap = new Map(filteredUploads.map((u) => [u.id, u]));

        moduleLogger.info(
          {
            context: {
              uploadsRequested: uploadIds.length,
              uploadsFound: filteredUploads.length,
              uploadsMissing: uploadIds.length - filteredUploads.length,
            },
          },
          'Fetched upload data from database',
        );

        // Map uploads to include thumbnails, preserving Elasticsearch order
        items = uploadIds
          .map((id) => uploadsMap.get(id))
          .filter((upload): upload is NonNullable<typeof upload> =>
            Boolean(upload),
          )
          .map((upload) => {
            const {
              defaultThumbnailPath,
              overrideThumbnailPath,
              channel,
              ...uploadRest
            } = upload;

            const thumbnailUrl = resolveThumbnailUrl({
              overrideThumbnailPath,
              defaultThumbnailPath,
              channelDefaultThumbnailPath: channel.defaultThumbnailPath,
              size: 'card',
            });

            const channelAvatarUrl = channel.avatarPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(channel.avatarPath),
                  {
                    resize: appAvatarXs2x,
                  },
                )
              : null;

            return {
              ...uploadRest,
              id: OutgoingIdSchema.parse(uploadRest.id),
              thumbnailUrl,
              _count: { uploadViews: viewCountMap.get(upload.id) ?? 0 },
              channel: {
                ...channel,
                id: OutgoingIdSchema.parse(channel.id),
                avatarUrl: channelAvatarUrl,
              },
            };
          });
      } else if (focus === 'transcripts' && transcriptsResponse) {
        // Get upload IDs from transcript hits
        const uploadIds = transcriptsResponse.hits.hits
          .filter((hit) => hit._index === 'lc_transcripts')
          .map((hit) => hit._id);

        moduleLogger.info(
          {
            context: {
              hitsFromElasticsearch: uploadIds.length,
            },
          },
          'Processing transcript search results',
        );

        // Fetch full upload data from database
        const [uploads, viewCountRows] =
          uploadIds.length > 0
            ? await Promise.all([
                db.query.UploadRecord.findMany({
                  where: (t, { inArray, isNotNull, and }) =>
                    and(
                      inArray(t.id, uploadIds),
                      isNotNull(t.transcodingFinishedAt),
                    ),
                  columns: {
                    id: true,
                    title: true,
                    description: true,
                    createdAt: true,
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
                        slug: true,
                        avatarPath: true,
                        defaultThumbnailPath: true,
                        visibility: true,
                        approvedAt: true,
                      },
                    },
                  },
                }),
                db
                  .select({
                    uploadRecordId: UploadView.uploadRecordId,
                    cnt: count(),
                  })
                  .from(UploadView)
                  .where(inArray(UploadView.uploadRecordId, uploadIds))
                  .groupBy(UploadView.uploadRecordId),
              ])
            : [[], [] as { uploadRecordId: string; cnt: number }[]];
        const viewCountMap = new Map(
          viewCountRows.map((r) => [r.uploadRecordId, Number(r.cnt)]),
        );

        // Filter to public approved channels
        const filteredUploads = uploads.filter(
          (u) =>
            u.channel.visibility === 'PUBLIC' && u.channel.approvedAt !== null,
        );

        // Create a map for quick lookup
        const uploadsMap = new Map(filteredUploads.map((u) => [u.id, u]));

        moduleLogger.info(
          {
            context: {
              uploadsRequested: uploadIds.length,
              uploadsFound: filteredUploads.length,
              uploadsMissing: uploadIds.length - filteredUploads.length,
            },
          },
          'Fetched upload data for transcripts from database',
        );

        // Map transcript hits to include upload data and transcript segments
        items = transcriptsResponse.hits.hits
          .filter((hit) => hit._index === 'lc_transcripts')
          .map((hit) => {
            const upload = uploadsMap.get(hit._id);
            if (!upload) return null;

            const {
              defaultThumbnailPath,
              overrideThumbnailPath,
              channel,
              ...uploadRest
            } = upload;

            const thumbnailUrl = resolveThumbnailUrl({
              overrideThumbnailPath,
              defaultThumbnailPath,
              channelDefaultThumbnailPath: channel.defaultThumbnailPath,
              size: 'card',
            });

            const channelAvatarUrl = channel.avatarPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(channel.avatarPath),
                  {
                    resize: appAvatarXs2x,
                  },
                )
              : null;

            // Extract transcript segments from inner_hits
            const segments =
              ('inner_hits' in hit &&
                hit.inner_hits?.segments?.hits?.hits?.map((innerHit) => ({
                  start: innerHit._source.start,
                  end: innerHit._source.end,
                  text:
                    innerHit.highlight?.['segments.text']?.[0] ??
                    innerHit._source.text,
                }))) ??
              [];

            return {
              ...uploadRest,
              id: OutgoingIdSchema.parse(uploadRest.id),
              thumbnailUrl,
              _count: { uploadViews: viewCountMap.get(upload.id) ?? 0 },
              channel: {
                ...channel,
                id: OutgoingIdSchema.parse(channel.id),
                avatarUrl: channelAvatarUrl,
              },
              segments,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);
      }

      const nextCursor = items.length === limit ? cursor + limit : null;

      moduleLogger.info(
        {
          context: {
            itemsReturned: items.length,
            hasMore: nextCursor !== null,
            channelsReturned: channelsWithAvatars.length,
            facetedChannelsReturned: facetedChannelsWithAvatars.length,
          },
        },
        'Search completed successfully',
      );

      return {
        items,
        mediaCount,
        transcriptCount,
        channels: channelsWithAvatars,
        facetedChannels: facetedChannelsWithAvatars,
        nextCursor,
      };
    }),

  // Hybrid (BM25 + document/paragraph kNN, fused with RRF) search over
  // lc_media_v1. One request-time query embedding; matched paragraphs surface
  // as `segments` on each item (times in ms, matching the existing UI).
  hybridSearch: publicProcedure
    .input(hybridSearchSchema)
    .query(async ({ input, ctx }) => {
      const {
        q,
        channelSlugs,
        channelIds: inputChannelIds,
        quotes,
        dateGte,
        dateLte,
        dateRange,
        sort,
        limit,
        cursor,
        skipLogging,
      } = input;

      const channelIds =
        channelSlugs && channelSlugs.length > 0
          ? await channelSlugsToIds(channelSlugs)
          : (inputChannelIds ?? null);

      // Explicit parser bounds win; otherwise fall back to the UI date bucket.
      const publishedAt =
        dateGte || dateLte
          ? {
              ...(dateGte ? { gte: dateGte } : {}),
              ...(dateLte ? { lte: dateLte } : {}),
            }
          : dateRangeToPublishedAt(dateRange, new Date());

      // Map the UI sort to a field sort. 'relevance' (default) keeps the fused
      // RRF order; the date sorts order by publishedAt (the RRF pipeline still
      // runs, then OpenSearch reorders by the field).
      const hybridSort =
        sort === 'date-asc'
          ? [{ publishedAt: 'asc' }]
          : sort === 'date-desc'
            ? [{ publishedAt: 'desc' }]
            : undefined;

      // Embed the query once with the model the index was built with. The
      // structured LLM parse + related-search generation are NOT on this path —
      // they're deliberately decoupled into `searchMeta` (a separate client
      // query) so a navigation renders results the moment retrieval returns,
      // without waiting on the (slower) nano LLM calls. Quote phrase-boosting
      // therefore uses the deterministic regex extractor instead of the parse.
      const embedRes = await createEmbeddingsTracked({
        model: EMBED_MODEL,
        input: q,
        tracking: { activity: 'searchEmbedQuery' },
      });
      const queryVector = embedRes.data[0]?.embedding;
      if (!queryVector) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to embed search query',
        });
      }

      // Quoted phrases drive `match_phrase` boosts in the retriever. Prefer
      // explicit input quotes; otherwise extract them deterministically from the
      // raw query (stable across pages, no LLM dependency).
      const quoteList =
        quotes && quotes.length > 0 ? quotes : extractQuotedPhrases(q);

      const [hybrid, channelFacetBuckets, channelsRaw, probeScore] =
        await Promise.all([
          runMediaHybridSearch({
            lexicalText: q,
            quotes: quoteList,
            channelIds,
            publishedAt,
            queryVector,
            from: cursor,
            size: limit,
            sort: hybridSort,
          }),
          // Channel facet list. Computed with the channel filter dropped (but
          // the same query + date) so selecting a channel doesn't collapse the
          // list — the other channels stay available to broaden the selection.
          // Only the client's page 0 consumes it, so skip the extra hybrid query
          // on subsequent pages.
          cursor === 0
            ? runMediaChannelFacets({
                lexicalText: q,
                quotes: quoteList,
                publishedAt,
                queryVector,
              }).catch(() => [])
            : Promise.resolve([]),
          osMsearch(msearchChannels(q, 0, 10)),
          // Absolute relevance probe (reuses the same query embedding). A probe
          // failure shouldn't suppress results, so fail open to null (= relevant).
          runMediaKnnProbe({ queryVector, channelIds, publishedAt }).catch(
            () => null,
          ),
        ]);

      // Whole-set relevance gate: when the best video isn't close enough, the
      // RRF list is just semantically-vague noise — drop the media results
      // (channels carousel still shows). Null probe → treat as relevant.
      const topCosine = probeScore == null ? null : 2 * probeScore - 1;
      const relevant =
        topCosine == null || topCosine >= RESULTS_RELEVANCE_COSINE_FLOOR;
      if (!relevant) {
        moduleLogger.info(
          { context: { query: q, cosine: topCosine } },
          'Hybrid results gated off (below relevance floor)',
        );
      }

      const mediaCount = relevant ? hybrid.total : 0;
      const gatedHits = relevant ? hybrid.hits : [];
      const uploadIds = gatedHits.map((h) => h._id);

      const segmentsByUploadId = new Map<string, MediaSegment[]>();
      for (const hit of gatedHits) {
        segmentsByUploadId.set(hit._id, mergeParagraphSnippets(hit));
      }

      const facetBuckets = relevant ? channelFacetBuckets : [];
      const carouselIds =
        MSearchResponseSchema.parse(channelsRaw)
          .responses[0]?.hits.hits.filter((h) => h._index === 'lc_channels')
          .map((h) => h._id) ?? [];

      const [items, facetedChannels, channels] = await Promise.all([
        hydrateUploads(uploadIds, segmentsByUploadId),
        hydrateChannelsForDisplay(facetBuckets.map((b) => b.key)),
        hydrateChannelsForDisplay(carouselIds),
      ]);

      // Log the search (initial page only, skip for admins inspecting logs).
      // The row id is handed back so the answer route can append the final
      // answer to this same row's params (see /api/search-answer).
      let searchLogId: string | null = null;
      try {
        const isAdmin = ctx.session?.appUser?.role === 'ADMIN';
        if (q.trim().length > 0 && cursor === 0 && !(skipLogging && isAdmin)) {
          const [row] = await db
            .insert(SearchLogEntry)
            .values({
              query: q,
              params: {
                mode: 'hybrid',
                channelIds: channelIds ?? [],
                quotes: quoteList,
                dateGte: dateGte ?? null,
                dateLte: dateLte ?? null,
                limit,
                cursor,
                // The structured LLM parse (questions, speakers, keywords,
                // dates, …) is merged in out-of-band by `searchMeta` once it
                // resolves — see that procedure.
              },
              appUserId: ctx.session?.appUserId ?? null,
              mediaCount,
              transcriptCount: 0,
              channelCount: channels.length,
            })
            .returning({ id: SearchLogEntry.id });
          searchLogId = row?.id ?? null;
        }
      } catch (error) {
        moduleLogger.error(
          {
            context: {
              error: error instanceof Error ? error.message : String(error),
            },
          },
          'Failed to log hybrid search',
        );
      }

      const nextCursor = items.length === limit ? cursor + limit : null;

      return {
        items,
        mediaCount,
        channels,
        facetedChannels,
        nextCursor,
        searchLogId,
      };
    }),

  // Sidebar/answer metadata for a query: the structured LLM parse (questions →
  // answer-panel decision, speakers → notice, channels/dates → filter
  // suggestions) and nano-generated related searches. Split out of
  // `hybridSearch` so retrieval never blocks on these (slower) LLM calls — the
  // client fetches this in parallel and the results render the moment retrieval
  // returns. Both LLM calls are Valkey-cached, so this is cheap on repeats.
  searchMeta: publicProcedure
    .input(
      z.object({
        q: z.string().min(1),
        // The search_log_entry row hybridSearch created for this query. When
        // present, the structured parse is merged into its params (so a search's
        // parse, answer, and sources all land in one row for the admin log).
        searchLogId: z.string().nullish(),
        // Channels that actually have results for this query (from
        // hybridSearch's facet aggregation). Passed so the parser grounds its
        // channel suggestion in real candidates instead of guessing from the
        // query text — so we can only ever suggest a real, non-empty filter.
        facetChannels: z
          .array(z.object({ slug: z.string(), name: z.string() }))
          .optional(),
      }),
    )
    .query(async ({ input }) => {
      const { q, searchLogId, facetChannels } = input;

      // Facets are doc_count-ordered; only the top few dominant channels are
      // plausible "you're looking for this channel" suggestions, and capping
      // keeps the parser prompt + its cache key bounded.
      const candidates = (facetChannels ?? []).slice(0, MAX_CANDIDATE_CHANNELS);

      const [parsed, relatedSearches] = await Promise.all([
        parseSearchQuery(q, {
          candidateChannels: candidates.map((c) => c.name),
        }),
        generateRelatedSearches(q).catch(() => []),
      ]);

      // Ground the suggestion: keep only parser-picked channels that map (by
      // normalized name) back to a real candidate, carrying its slug. The parser
      // is told to echo candidate names verbatim, so this is a direct lookup —
      // no extra OpenSearch round-trip.
      const candidateByName = new Map(
        candidates.map((c) => [c.name.trim().toLowerCase(), c]),
      );
      const matchedChannels: Array<{ slug: string; name: string }> = [];
      const seenSlugs = new Set<string>();
      for (const name of parsed.channels) {
        const candidate = candidateByName.get(name.trim().toLowerCase());
        if (candidate && !seenSlugs.has(candidate.slug)) {
          seenSlugs.add(candidate.slug);
          matchedChannels.push({ slug: candidate.slug, name: candidate.name });
        }
      }

      // Best-effort: attach the structured parse to this search's log row.
      // No-op when there's no row id (logging skipped, or pagination).
      if (searchLogId) {
        try {
          await db
            .update(SearchLogEntry)
            .set({
              params: sql`${SearchLogEntry.params} || ${JSON.stringify({ parsed })}::jsonb`,
            })
            .where(eq(SearchLogEntry.id, searchLogId));
        } catch (error) {
          moduleLogger.warn(
            {
              context: {
                error: error instanceof Error ? error.message : String(error),
              },
            },
            'Failed to attach parse to search log',
          );
        }
      }

      return {
        relatedSearches,
        parsed: {
          questions: parsed.questions,
          speakers: parsed.speakers,
          speakerNotice: parsed.speakers.length > 0,
          // Real facet channels the parser judged the query to be seeking —
          // offered as click-to-apply channel-filter suggestions.
          matchedChannels,
          // Date suggestion: a current-period bucket ("this week" → the facet
          // bucket), or an absolute range with an optional relative label
          // ("past month", "since 2020"). Null when no time bound was implied.
          dateRange: parsed.dateRange,
          dates: parsed.dates,
          dateLabel: parsed.dateLabel,
        },
      };
    }),

  getRecentSearches: authProcedure.query(async ({ ctx }) => {
    // Use SQL-style query for distinct on query field
    const recentSearches = await db.query.SearchLogEntry.findMany({
      where: (t, { eq, isNull, and }) =>
        and(eq(t.appUserId, ctx.session.appUserId), isNull(t.userDeletedAt)),
      columns: {
        query: true,
        createdAt: true,
      },
      orderBy: (t, { desc }) => desc(t.createdAt),
      limit: 100, // Fetch more to deduplicate in JS
    });

    // Deduplicate by query, keeping the most recent entry for each query
    const seenQueries = new Set<string>();
    const deduplicated = recentSearches.filter((entry) => {
      if (seenQueries.has(entry.query)) return false;
      seenQueries.add(entry.query);
      return true;
    });

    const result = deduplicated.slice(0, 10);

    moduleLogger.info(
      {
        context: {
          userId: ctx.session.appUserId,
          searchCount: result.length,
        },
      },
      'Retrieved recent searches',
    );

    // Map createdAt to searchedAt for the API response
    return result.map((entry) => ({
      query: entry.query,
      searchedAt: entry.createdAt,
    }));
  }),

  deleteRecentSearch: authProcedure
    .input(
      z.object({
        query: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await db
        .update(SearchLogEntry)
        .set({
          userDeletedAt: new Date(),
        })
        .where(
          and(
            eq(SearchLogEntry.appUserId, ctx.session.appUserId),
            eq(SearchLogEntry.query, input.query),
          ),
        )
        .returning();

      moduleLogger.info(
        {
          context: {
            userId: ctx.session.appUserId,
            query: input.query,
            entriesDeleted: result.length,
          },
        },
        'Deleted recent search',
      );

      return { success: true };
    }),
};
