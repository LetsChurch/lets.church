import { prisma } from '@letschurch/db';
import {
  client,
  MSearchResponseSchema,
  msearchChannels,
  msearchTranscripts,
  msearchUploads,
} from '@letschurch/elasticsearch';
import { z } from 'zod';
import {
  getThumbnailResize,
  IncomingIdSchema,
  OutgoingIdSchema,
} from '@/schemas/common';
import logger from '@/util/logger';
import { publicS3 } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';
import { authProcedure, publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/search',
});

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
});

export const searchProcedures = {
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
      } = input;

      // Convert channel slugs to IDs if provided
      let channelIds = inputChannelIds;
      if (channelSlugs && channelSlugs.length > 0) {
        const channels = await prisma.channel.findMany({
          select: { id: true },
          where: {
            slug: { in: channelSlugs },
            visibility: 'PUBLIC',
            approvedAt: { not: null },
            deletedAt: null,
          },
        });
        channelIds = channels.map((c) => c.id);

        moduleLogger.info('Converted channel slugs to IDs', {
          slugsProvided: channelSlugs.length,
          channelsFound: channels.length,
          channelIds,
        });
      }

      moduleLogger.info('Performing search', {
        query: q,
        focus,
        channelIds,
        channelSlugs,
        limit,
        cursor,
        sort,
        dateRange,
      });

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

        moduleLogger.info('Applied date range filter', {
          dateRange,
          startDate: startDate.toISOString(),
          endDate,
        });
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
        ...msearchChannels(q, 0, 10), // Always get top 10 channels
      ];

      // Perform the multisearch
      moduleLogger.info('Executing ElasticSearch multisearch', {
        searchCount: searches.length / 2, // Each search has header + body
        mediaLimit,
        transcriptLimit,
        channelsLimit: 10,
      });

      const response = await client.msearch({
        searches,
      });

      // Parse and validate the response
      const parsed = MSearchResponseSchema.parse(response);

      moduleLogger.info('ElasticSearch multisearch completed', {
        responseCount: parsed.responses.length,
      });

      const [uploadsResponse, transcriptsResponse, _channelsResponse] =
        parsed.responses;

      // Extract counts
      const mediaCount = uploadsResponse?.hits.total.value ?? 0;
      const transcriptCount = transcriptsResponse?.hits.total.value ?? 0;

      moduleLogger.info('Search result counts', {
        mediaCount,
        transcriptCount,
        focus,
      });

      // Log the search with result counts
      // Check referer to detect focus switches (tab changes on same search page)
      try {
        const referer = ctx.req.headers.get('referer');
        let shouldSkipLogging = false;

        moduleLogger.info(
          {
            referer,
            currentQuery: q,
            currentFocus: focus,
          },
          'Referer check',
        );

        // Parse referer URL to check if it's from the same search with different focus
        if (referer) {
          try {
            const refererUrl = new URL(referer);
            const refererParams = new URLSearchParams(refererUrl.search);
            const refererQuery = refererParams.get('q');
            const refererFocus = refererParams.get('focus') || 'media';
            const refererChannelSlugs = refererParams.getAll('channelSlugs');
            const refererSort = refererParams.get('sort');
            const refererDateRange = refererParams.get('dateRange');

            // Check if coming from same search with different focus
            const isFromSearchPage = refererUrl.pathname === '/search';
            const isSameQuery = refererQuery === q;
            const isDifferentFocus = refererFocus !== focus;

            // Compare filters (only if they exist in the referer)
            const hasSameChannelSlugs =
              refererChannelSlugs.length === 0 ||
              JSON.stringify(refererChannelSlugs.sort()) ===
                JSON.stringify((channelSlugs ?? []).sort());
            const hasSameSort = !refererSort || refererSort === sort;
            const hasSameDateRange =
              !refererDateRange || refererDateRange === dateRange;

            moduleLogger.info(
              {
                refererUrl: refererUrl.toString(),
                refererPathname: refererUrl.pathname,
                refererQuery,
                refererFocus,
                refererChannelSlugs,
                refererSort,
                refererDateRange,
                isFromSearchPage,
                isSameQuery,
                isDifferentFocus,
                hasSameChannelSlugs,
                hasSameSort,
                hasSameDateRange,
              },
              'Referer parsed',
            );

            if (
              isFromSearchPage &&
              isSameQuery &&
              isDifferentFocus &&
              hasSameChannelSlugs &&
              hasSameSort &&
              hasSameDateRange
            ) {
              shouldSkipLogging = true;

              moduleLogger.info(
                {
                  userId: ctx.session?.appUserId,
                  query: q,
                  referer,
                  previousFocus: refererFocus,
                  newFocus: focus,
                },
                'Skipping duplicate search (focus switch detected via referer)',
              );
            }
          } catch (urlError) {
            // Invalid referer URL, ignore
            moduleLogger.warn(
              {
                referer,
                error:
                  urlError instanceof Error
                    ? urlError.message
                    : String(urlError),
              },
              'Failed to parse referer URL',
            );
          }
        }

        // Only log if query is not empty or whitespace AND this is the initial search (not pagination)
        if (!shouldSkipLogging && q.trim().length > 0 && cursor === 0) {
          const logEntry = await prisma.searchLogEntry.create({
            data: {
              query: q,
              params: {
                focus,
                channelIds: channelIds ?? [],
                limit,
                cursor,
                sort,
                dateRange,
              },
              appUserId: ctx.session?.appUserId,
              mediaCount,
              transcriptCount,
              channelCount: 0, // Will be updated after we fetch channels
            },
          });

          searchLogEntryId = logEntry.id;

          moduleLogger.info('Search query logged to database', {
            userId: ctx.session?.appUserId,
            searchLogId: searchLogEntryId,
            referer,
          });
        }
      } catch (error) {
        moduleLogger.error('Failed to log search', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't fail the search if logging fails
      }

      // Extract channel aggregations from the focused response
      const channelAggs =
        (focus === 'media'
          ? uploadsResponse?.aggregations?.channelIds?.buckets
          : transcriptsResponse?.aggregations?.channelIds?.buckets) ?? [];

      // Get channel data for carousel and filters
      const channelIdsFromAggs = channelAggs.map((bucket) => bucket.key);
      const channels = await prisma.channel.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          avatarPath: true,
        },
        where: {
          id: { in: channelIdsFromAggs },
          visibility: 'PUBLIC',
          approvedAt: { not: null },
          deletedAt: null,
        },
      });

      moduleLogger.info('Fetched channel aggregation data', {
        aggregatedChannels: channelIdsFromAggs.length,
        channelsFound: channels.length,
      });

      // Update the search log entry with channel count (only if we logged this search)
      if (searchLogEntryId) {
        try {
          await prisma.searchLogEntry.update({
            where: { id: searchLogEntryId },
            data: {
              channelCount: channels.length,
            },
          });
        } catch (error) {
          moduleLogger.error('Failed to update search log channel count', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const channelsWithAvatars = channels.map((channel) => {
        const avatarUrl = channel.avatarPath
          ? getPublicImageUrl(publicS3.getS3ProtocolUri(channel.avatarPath), {
              resize: { width: 64, height: 64 },
            })
          : null;

        return {
          ...channel,
          id: OutgoingIdSchema.parse(channel.id),
          avatarUrl,
        };
      });

      // Process results based on focus
      let items: Array<unknown> = [];

      if (focus === 'media' && uploadsResponse) {
        // Get upload IDs from hits
        const uploadIds = uploadsResponse.hits.hits
          .filter((hit) => hit._index === 'lc_uploads_v2')
          .map((hit) => hit._id);

        moduleLogger.info('Processing media search results', {
          hitsFromElasticsearch: uploadIds.length,
        });

        // Fetch full upload data from database
        const uploads = await prisma.uploadRecord.findMany({
          select: {
            id: true,
            title: true,
            description: true,
            createdAt: true,
            publishedAt: true,
            lengthSeconds: true,
            defaultThumbnailPath: true,
            overrideThumbnailPath: true,
            channel: {
              select: {
                id: true,
                name: true,
                slug: true,
                avatarPath: true,
                defaultThumbnailPath: true,
              },
            },
            _count: {
              select: {
                uploadViews: true,
              },
            },
          },
          where: {
            id: { in: uploadIds },
            channel: {
              visibility: 'PUBLIC',
              approvedAt: { not: null },
            },
          },
        });

        // Create a map for quick lookup
        const uploadsMap = new Map(uploads.map((u) => [u.id, u]));

        moduleLogger.info('Fetched upload data from database', {
          uploadsRequested: uploadIds.length,
          uploadsFound: uploads.length,
          uploadsMissing: uploadIds.length - uploads.length,
        });

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

            const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;
            const thumbnailUrl = thumbnailPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(thumbnailPath),
                  getThumbnailResize('card'),
                )
              : null;

            const channelAvatarUrl = channel.avatarPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(channel.avatarPath),
                  {
                    resize: { width: 32, height: 32 },
                  },
                )
              : null;

            const channelDefaultThumbnailUrl = channel.defaultThumbnailPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(channel.defaultThumbnailPath),
                  getThumbnailResize('card'),
                )
              : null;

            return {
              ...uploadRest,
              id: OutgoingIdSchema.parse(uploadRest.id),
              thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
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

        moduleLogger.info('Processing transcript search results', {
          hitsFromElasticsearch: uploadIds.length,
        });

        // Fetch full upload data from database
        const uploads = await prisma.uploadRecord.findMany({
          select: {
            id: true,
            title: true,
            description: true,
            createdAt: true,
            publishedAt: true,
            lengthSeconds: true,
            defaultThumbnailPath: true,
            overrideThumbnailPath: true,
            channel: {
              select: {
                id: true,
                name: true,
                slug: true,
                avatarPath: true,
                defaultThumbnailPath: true,
              },
            },
            _count: {
              select: {
                uploadViews: true,
              },
            },
          },
          where: {
            id: { in: uploadIds },
            channel: {
              visibility: 'PUBLIC',
              approvedAt: { not: null },
            },
          },
        });

        // Create a map for quick lookup
        const uploadsMap = new Map(uploads.map((u) => [u.id, u]));

        moduleLogger.info('Fetched upload data for transcripts from database', {
          uploadsRequested: uploadIds.length,
          uploadsFound: uploads.length,
          uploadsMissing: uploadIds.length - uploads.length,
        });

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

            const thumbnailPath = overrideThumbnailPath ?? defaultThumbnailPath;
            const thumbnailUrl = thumbnailPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(thumbnailPath),
                  getThumbnailResize('card'),
                )
              : null;

            const channelAvatarUrl = channel.avatarPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(channel.avatarPath),
                  {
                    resize: { width: 32, height: 32 },
                  },
                )
              : null;

            const channelDefaultThumbnailUrl = channel.defaultThumbnailPath
              ? getPublicImageUrl(
                  publicS3.getS3ProtocolUri(channel.defaultThumbnailPath),
                  getThumbnailResize('card'),
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
              thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
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

      moduleLogger.info('Search completed successfully', {
        itemsReturned: items.length,
        hasMore: nextCursor !== null,
        nextCursor,
        channelsReturned: channelsWithAvatars.length,
      });

      return {
        items,
        mediaCount,
        transcriptCount,
        channels: channelsWithAvatars,
        nextCursor,
      };
    }),

  getRecentSearches: authProcedure.query(async ({ ctx }) => {
    const recentSearches = await prisma.searchLogEntry.findMany({
      where: {
        appUserId: ctx.session.appUserId,
        userDeletedAt: null,
      },
      select: {
        query: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      distinct: ['query'],
      take: 10,
    });

    moduleLogger.info('Retrieved recent searches', {
      userId: ctx.session.appUserId,
      searchCount: recentSearches.length,
    });

    // Map createdAt to searchedAt for the API response
    return recentSearches.map((entry) => ({
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
      const result = await prisma.searchLogEntry.updateMany({
        where: {
          appUserId: ctx.session.appUserId,
          query: input.query,
          userDeletedAt: null,
        },
        data: {
          userDeletedAt: new Date(),
        },
      });

      moduleLogger.info('Deleted recent search', {
        userId: ctx.session.appUserId,
        query: input.query,
        entriesDeleted: result.count,
      });

      return { success: true };
    }),
};
