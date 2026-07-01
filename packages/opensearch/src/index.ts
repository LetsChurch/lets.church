import { z } from 'zod';
import { escapeDocument } from './utils';

export { escapeDocument };
// Client + transport wrappers live in ./client to avoid an index <-> media-search
// import cycle (which triggered a Vite SSR TDZ error). Re-export them here so
// existing `@letschurch/opensearch` imports keep working.
export {
  client,
  type OsMsearchItem,
  type OsQuery,
  osMsearch,
  osSearch,
  waitForOpenSearch,
} from './client';
export * from './media-search';

import type { OsMsearchItem } from './client';

export function msearchChannels(
  query: string,
  from = 0,
  size = 0,
): [OsMsearchItem, OsMsearchItem] {
  return [
    { index: 'lc_channels' },
    {
      from,
      size,
      query: {
        bool: {
          should: [],
          must: [
            {
              multi_match: {
                query,
                type: 'bool_prefix',
                fields: ['name^3', 'name._2gram', 'name._3gram'],
              },
            },
            { term: { visibility: 'PUBLIC' } },
          ],
        },
      },
    },
  ];
}

export function msearchOrganizations(
  query: string,
  from = 0,
  size = 0,
  params?: {
    orgType?: string | null;
    geo?: { range: string; lat: number; lon: number } | null;
    organization?: string | null;
    tags?: string[] | null;
  },
): [OsMsearchItem, OsMsearchItem] {
  const trimmed = query.trim();

  return [
    { index: 'lc_organizations' },
    {
      from,
      size,
      query: {
        bool: {
          must: [
            { term: { type: params?.orgType ?? 'CHURCH' } },
            ...(query
              ? [
                  {
                    multi_match: {
                      query: trimmed,
                      type: 'bool_prefix' as const,
                      fields: ['name^3', 'name._2gram', 'name._3gram'],
                    },
                  },
                ]
              : []),
            ...(params?.organization
              ? [
                  {
                    term: {
                      upstreamOrganizationAssociations: params?.organization,
                    },
                  },
                ]
              : []),
          ],
          should: [
            ...(params?.tags?.map((tag) => ({ term: { tags: tag } })) ?? []),
          ],
          // If there are three or fewer tags, they all must match. If there are four or more tags, 75% must match.
          minimum_should_match: '3<75%',
          filter: params?.geo
            ? [
                {
                  geo_distance: {
                    distance: params.geo.range,
                    meetingLocation: {
                      lat: params.geo.lat,
                      lon: params.geo.lon,
                    },
                  },
                },
              ]
            : [],
        },
      },
    },
  ];
}

export const BaseHitSchema = {
  _id: z.string(),
  _score: z.number().nullable(),
};

export const ChannelHitSourceSchema = z.object({
  name: z.string(),
});

export const ChannelHitHighlightSchema = z.object({
  name: z.array(z.string()),
});

export const OrganizationHitSourceSchema = z.object({
  name: z.string(),
});

export const OrganizationHitHighlightSchema = z.object({
  name: z.array(z.string()),
});

export const ChannelHitSchema = z.object({
  ...BaseHitSchema,
  _index: z.literal('lc_channels'),
  _source: ChannelHitSourceSchema,
});

export const OrganizationHitSchema = z.object({
  ...BaseHitSchema,
  _index: z.literal('lc_organizations'),
  _source: OrganizationHitSourceSchema,
});

export const MSearchResponseSchema = z.object({
  took: z.number(),
  responses: z.array(
    z.object({
      took: z.number(),
      timed_out: z.boolean(),
      _shards: z.object({
        total: z.number(),
        successful: z.number(),
        skipped: z.number(),
        failed: z.number(),
      }),
      hits: z.object({
        total: z.object({ value: z.number(), relation: z.string() }),
        hits: z.array(
          z.discriminatedUnion('_index', [
            ChannelHitSchema,
            OrganizationHitSchema,
          ]),
        ),
      }),
      aggregations: z
        .object({
          channelIds: z
            .object({
              doc_count_error_upper_bound: z.number(),
              sum_other_doc_count: z.number(),
              buckets: z.array(
                z.object({
                  key: z.uuid(),
                  doc_count: z.number(),
                }),
              ),
            })
            .optional(),
          minPublishedAt: z
            .object({
              value: z.number().nullable(), // null when there are no matches
            })
            .optional(),
          maxPublishedAt: z
            .object({
              value: z.number().nullable(), // null when there are no matches
            })
            .optional(),
        })
        .optional(),
    }),
  ),
});
