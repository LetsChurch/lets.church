import { prisma } from '@letschurch/db';
import {
  client,
  MSearchResponseSchema,
  msearchChannels,
  msearchTranscripts,
  msearchUploads,
} from '@letschurch/elasticsearch';
import { publicS3 } from '@letschurch/s3/public';
import { v5 as uuidv5 } from 'uuid';
import { z } from 'zod';
import { IncomingIdSchema, OutgoingIdSchema } from '@/schemas/common';
import { appAvatarSm2x, appAvatarXs2x } from '@/util/avatar-sizes';
import logger from '@/util/logger';
import { resolveThumbnailUrl } from '@/util/thumbnails';
import { getPublicImageUrl } from '@/util/url';
import { authProcedure, publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/search',
});

// Namespace UUID for search logs (generated once using uuidv4)
const SEARCH_LOG_NAMESPACE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

/**
 * Generate a deterministic ID for a search query based on its parameters
 * and a time bucket (5 minutes). This makes search logging idempotent
 * by preventing duplicate entries for the same search within the time window.
 */
function generateSearchLogId(
  query: string,
  params: {
    focus: string;
    channelIds?: string[] | null;
    sort?: string;
    dateRange?: string;
  },
  appUserId: string | undefined,
  timeBucketMinutes: number = 5,
): string {
  // Round timestamp to time bucket (e.g., 5 minute intervals)
  const now = new Date();
  const bucketMs = timeBucketMinutes * 60 * 1000;
  const bucketedTimestamp = Math.floor(now.getTime() / bucketMs) * bucketMs;

  // Create a stable string representation using delimited fields
  // This guarantees consistent ordering regardless of JSON.stringify behavior
  const searchKey = [
    query.trim().toLowerCase(),
    params.focus,
    (params.channelIds ?? []).sort().join(','),
    params.sort ?? '',
    params.dateRange ?? '',
    appUserId ?? '',
    bucketedTimestamp.toString(),
  ].join('|');

  // Generate a deterministic UUID v5 from the stable string
  return uuidv5(searchKey, SEARCH_LOG_NAMESPACE);
}

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
        skipLogging,
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
        ...msearchChannels(q, 0, 10), // Always get top 10 channels
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

      const response = await client.msearch({
        searches,
      });

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
      // Using idempotent logging with deterministic IDs to prevent duplicates
      try {
        // Determine if we should skip logging
        const isAdmin = ctx.session?.appUser?.role === 'ADMIN';
        const shouldSkipLogging = skipLogging && isAdmin;

        // Only log if query is not empty or whitespace AND this is the initial search (not pagination)
        // AND we're not skipping logging (admin viewing search logs)
        if (q.trim().length > 0 && cursor === 0 && !shouldSkipLogging) {
          // Generate deterministic ID for idempotent logging
          const logId = generateSearchLogId(
            q,
            {
              focus,
              channelIds: channelIds ?? undefined,
              sort,
              dateRange,
            },
            ctx.session?.appUserId,
          );

          const logEntry = await prisma.searchLogEntry.upsert({
            where: { id: logId },
            create: {
              id: logId,
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
            update: {
              // Update counts in case results changed (ES index updated, etc.)
              mediaCount,
              transcriptCount,
            },
          });

          searchLogEntryId = logEntry.id;

          moduleLogger.info(
            {
              context: {
                userId: ctx.session?.appUserId,
                searchLogId: searchLogEntryId,
                isNewEntry: logEntry.createdAt.getTime() > Date.now() - 1000,
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

      // Extract channel IDs from channel search results
      const channelIdsFromSearch = channelsResponse?.hits.hits
        .filter((hit) => hit._index === 'lc_channels')
        .map((hit) => hit._id);

      // Get channel data for carousel from channel search results
      const dbChannels = await prisma.channel.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          avatarPath: true,
        },
        where: {
          id: { in: channelIdsFromSearch },
          visibility: 'PUBLIC',
          approvedAt: { not: null },
          deletedAt: null,
        },
      });

      const dbChannelsMap = new Map(dbChannels.map((c) => [c.id, c]));

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
          await prisma.searchLogEntry.update({
            where: { id: searchLogEntryId },
            data: {
              channelCount: channelsWithAvatars.length,
            },
          });
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

        moduleLogger.info(
          {
            context: {
              uploadsRequested: uploadIds.length,
              uploadsFound: uploads.length,
              uploadsMissing: uploadIds.length - uploads.length,
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

        moduleLogger.info(
          {
            context: {
              uploadsRequested: uploadIds.length,
              uploadsFound: uploads.length,
              uploadsMissing: uploadIds.length - uploads.length,
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
          },
        },
        'Search completed successfully',
      );

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

    moduleLogger.info(
      {
        context: {
          userId: ctx.session.appUserId,
          searchCount: recentSearches.length,
        },
      },
      'Retrieved recent searches',
    );

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

      moduleLogger.info(
        {
          context: {
            userId: ctx.session.appUserId,
            query: input.query,
            entriesDeleted: result.count,
          },
        },
        'Deleted recent search',
      );

      return { success: true };
    }),
};
