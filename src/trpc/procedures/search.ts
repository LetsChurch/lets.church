import { z } from 'zod';
import { getThumbnailResize } from '@/schemas/common';
import db from '@/util/db';
import {
  client,
  MSearchResponseSchema,
  msearchChannels,
  msearchTranscripts,
  msearchUploads,
} from '@/util/elasticsearch';
import logger from '@/util/logger';
import { getS3ProtocolUri } from '@/util/s3';
import { getPublicImageUrl } from '@/util/url';
import { publicProcedure } from '../trpc';

const moduleLogger = logger.child({
  module: 'trpc/procedures/search',
});

const searchQuerySchema = z.object({
  q: z.string().min(1),
  focus: z.enum(['media', 'transcripts']).default('media'),
  channelIds: z.array(z.uuid()).optional().nullable(),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.number().min(0).default(0), // Offset-based cursor
});

export const searchProcedures = {
  performSearch: publicProcedure
    .input(searchQuerySchema)
    .query(async ({ input }) => {
      const { q, focus, channelIds, limit, cursor } = input;

      moduleLogger.info('Performing search', {
        query: q,
        focus,
        channelIds,
        limit,
        cursor,
      });

      // Log the search
      try {
        await db.searchLogEntry.create({
          data: {
            query: q,
            params: {
              focus,
              channelIds: channelIds ?? [],
              limit,
              cursor,
            },
          },
        });
      } catch (error) {
        moduleLogger.error('Failed to log search', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't fail the search if logging fails
      }

      // Determine which index to focus on and which to get metadata only
      const mediaLimit = focus === 'media' ? limit : 0;
      const transcriptLimit = focus === 'transcripts' ? limit : 0;

      // Prepare multisearch body
      const searches = [
        ...msearchUploads(q, cursor, mediaLimit, {
          channelIds,
        }),
        ...msearchTranscripts(q, cursor, transcriptLimit, {
          channelIds,
        }),
        ...msearchChannels(q, 0, 10), // Always get top 10 channels
      ];

      // Perform the multisearch
      const response = await client.msearch({
        searches,
      });

      // Parse and validate the response
      const parsed = MSearchResponseSchema.parse(response);

      const [uploadsResponse, transcriptsResponse, _channelsResponse] =
        parsed.responses;

      // Extract counts
      const mediaCount = uploadsResponse?.hits.total.value ?? 0;
      const transcriptCount = transcriptsResponse?.hits.total.value ?? 0;

      // Extract channel aggregations from the focused response
      const channelAggs =
        (focus === 'media'
          ? uploadsResponse?.aggregations?.channelIds?.buckets
          : transcriptsResponse?.aggregations?.channelIds?.buckets) ?? [];

      // Get channel data for carousel
      const channelIdsFromAggs = channelAggs.map((bucket) => bucket.key);
      const channels = await db.channel.findMany({
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
        },
      });

      const channelsWithAvatars = channels.map((channel) => {
        const avatarUrl = channel.avatarPath
          ? getPublicImageUrl(getS3ProtocolUri('PUBLIC', channel.avatarPath), {
              resize: { width: 64, height: 64 },
            })
          : null;

        return {
          ...channel,
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

        // Fetch full upload data from database
        const uploads = await db.uploadRecord.findMany({
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
          },
        });

        // Create a map for quick lookup
        const uploadsMap = new Map(uploads.map((u) => [u.id, u]));

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
                  getS3ProtocolUri('PUBLIC', thumbnailPath),
                  getThumbnailResize('card'),
                )
              : null;

            const channelAvatarUrl = channel.avatarPath
              ? getPublicImageUrl(
                  getS3ProtocolUri('PUBLIC', channel.avatarPath),
                  {
                    resize: { width: 32, height: 32 },
                  },
                )
              : null;

            const channelDefaultThumbnailUrl = channel.defaultThumbnailPath
              ? getPublicImageUrl(
                  getS3ProtocolUri('PUBLIC', channel.defaultThumbnailPath),
                  getThumbnailResize('card'),
                )
              : null;

            return {
              ...uploadRest,
              thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
              channel: {
                ...channel,
                avatarUrl: channelAvatarUrl,
              },
            };
          });
      } else if (focus === 'transcripts' && transcriptsResponse) {
        // Get upload IDs from transcript hits
        const uploadIds = transcriptsResponse.hits.hits
          .filter((hit) => hit._index === 'lc_transcripts')
          .map((hit) => hit._id);

        // Fetch full upload data from database
        const uploads = await db.uploadRecord.findMany({
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
          },
        });

        // Create a map for quick lookup
        const uploadsMap = new Map(uploads.map((u) => [u.id, u]));

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
                  getS3ProtocolUri('PUBLIC', thumbnailPath),
                  getThumbnailResize('card'),
                )
              : null;

            const channelAvatarUrl = channel.avatarPath
              ? getPublicImageUrl(
                  getS3ProtocolUri('PUBLIC', channel.avatarPath),
                  {
                    resize: { width: 32, height: 32 },
                  },
                )
              : null;

            const channelDefaultThumbnailUrl = channel.defaultThumbnailPath
              ? getPublicImageUrl(
                  getS3ProtocolUri('PUBLIC', channel.defaultThumbnailPath),
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
              thumbnailUrl: thumbnailUrl || channelDefaultThumbnailUrl,
              channel: {
                ...channel,
                avatarUrl: channelAvatarUrl,
              },
              segments,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);
      }

      const nextCursor = items.length === limit ? cursor + limit : null;

      return {
        items,
        mediaCount,
        transcriptCount,
        channels: channelsWithAvatars,
        nextCursor,
      };
    }),
};
