import { Client } from '@elastic/elasticsearch';
import type {
  MsearchMultisearchBody,
  MsearchRequestItem,
  QueryDslQueryContainer,
} from '@elastic/elasticsearch/lib/api/types';
import envariant from '@knpwrs/envariant';
import waitOn from 'wait-on';
import { z } from 'zod';
import { adjacentPairs } from './misc';
export { escapeDocument } from './xss';

const ELASTICSEARCH_URL = envariant('ELASTICSEARCH_URL');

export const client = new Client({
  node: ELASTICSEARCH_URL,
});

export async function waitForElasticsearch() {
  return waitOn({
    resources: [ELASTICSEARCH_URL],
  });
}

type PublishedAtRange = { gte?: string; lte?: string };
type OrderBy = 'avg' | 'sum' | 'date' | 'dateDesc';

function makePostFilterSpread({
  channelIds,
  publishedAt,
}: {
  channelIds?: Array<string> | null;
  publishedAt?: PublishedAtRange | undefined;
  orderBy?: OrderBy | undefined;
}): MsearchMultisearchBody {
  const res: MsearchMultisearchBody = {};

  const must: Array<QueryDslQueryContainer> = [];

  if ((Array.isArray(channelIds) && channelIds.length > 0) || publishedAt) {
    res.post_filter = { bool: { must: [], should: [] } };
  }

  if (Array.isArray(channelIds) && channelIds.length > 0) {
    must.push({ terms: { channelId: channelIds } });
  }

  if (publishedAt) {
    must.push({ range: { publishedAt } });
  }

  if (must.length > 0) {
    res.post_filter = { bool: { must, should: [] } };
  }

  return res;
}

export function msearchUploads(
  query: string,
  from = 0,
  size = 0,
  {
    channelIds = [],
    publishedAt,
    orderBy,
  }: {
    channelIds?: string[] | null | undefined;
    publishedAt?: PublishedAtRange | undefined;
    orderBy?: OrderBy | undefined;
  },
): [MsearchRequestItem, MsearchRequestItem] {
  const trimmed = query.trim();
  const words = trimmed.split(/\s+/g);

  const hasChannels = (channelIds?.length ?? 0) > 0;

  return [
    { index: 'lc_uploads_v2' },
    {
      from,
      size,
      query: {
        bool: {
          minimum_should_match: 1,
          should: [
            {
              match_phrase: {
                title: {
                  query: trimmed,
                  slop: words.length <= 2 ? 0 : 2,
                  boost: 2,
                },
              },
            },
            {
              match_phrase: {
                description: {
                  query: trimmed,
                  slop: words.length <= 2 ? 0 : 2,
                },
              },
            },
          ],
          must: [
            { term: { visibility: 'PUBLIC' } },
            { exists: { field: 'transcodingFinishedAt' } },
            { exists: { field: 'transcribingFinishedAt' } },
            // Only select channels that are public, unless channels are provided
            ...(hasChannels ? [] : [{ term: { channelVisibility: 'PUBLIC' } }]),
          ],
        },
      },
      ...makePostFilterSpread({ channelIds, publishedAt }),
      ...(orderBy === 'date'
        ? { sort: [{ publishedAt: { order: 'asc' } }] }
        : orderBy === 'dateDesc'
        ? { sort: [{ publishedAt: { order: 'desc' } }] }
        : {}),
      aggs: {
        channelIds: {
          terms: {
            field: 'channelId',
            size: 100,
          },
        },
        minPublishedAt: {
          min: {
            field: 'publishedAt',
          },
        },
        maxPublishedAt: {
          max: {
            field: 'publishedAt',
          },
        },
      },
    },
  ];
}

export function msearchTranscripts(
  query: string,
  from = 0,
  size = 0,
  {
    channelIds = [],
    publishedAt,
    orderBy,
    phrase = true,
  }: {
    channelIds?: string[] | null | undefined;
    publishedAt?: { gte?: string; lte?: string } | undefined;
    orderBy?: OrderBy | undefined;
    phrase?: boolean;
  },
): [MsearchRequestItem, MsearchRequestItem] {
  const trimmed = query.trim();
  const words = trimmed.split(/\s+/g);

  const hasChannels = (channelIds?.length ?? 0) > 0;

  return [
    { index: 'lc_transcripts' },
    {
      from,
      size,
      _source: false,
      query: {
        bool: {
          should: [],
          must: [
            { term: { visibility: 'PUBLIC' } },
            { exists: { field: 'transcodingFinishedAt' } },
            { exists: { field: 'transcribingFinishedAt' } },
            // Only select channels that are public, unless channels are provided
            ...(hasChannels ? [] : [{ term: { channelVisibility: 'PUBLIC' } }]),
            {
              nested: {
                path: 'segments',
                score_mode: orderBy === 'sum' ? 'sum' : 'avg',
                query: phrase
                  ? {
                      match_phrase: {
                        'segments.text': {
                          query: trimmed,
                          slop: words.length <= 2 ? 0 : 2,
                        },
                      },
                    }
                  : {
                      bool: {
                        // If there are multiple words, require at least two matches
                        minimum_should_match: words.length > 1 ? 2 : 1,
                        should: [
                          // Match any words
                          {
                            match: {
                              'segments.text': {
                                query: query.trim(),
                                fuzziness: 'AUTO',
                                // Basic match
                                boost: 1,
                              },
                            },
                          },
                          // Match adjacent pairs of words within a certain proximity
                          ...(words.length > 1
                            ? adjacentPairs(words as [string, ...string[]]).map(
                                (pair) => ({
                                  match_phrase: {
                                    'segments.text': {
                                      query: pair.join(' '),
                                      slop: 2,
                                      // Adjacent pair match, double score
                                      boost: 2,
                                    },
                                  },
                                }),
                              )
                            : []),
                        ],
                      },
                    },
                inner_hits: {
                  _source: true,
                  size: 10,
                  highlight: {
                    pre_tags: ['<mark>'],
                    post_tags: ['</mark>'],
                    encoder: 'html',
                    fields: {
                      'segments.text': {},
                    },
                  },
                },
              },
            },
          ],
        },
      },
      ...makePostFilterSpread({ channelIds, publishedAt }),
      ...(orderBy === 'date'
        ? { sort: [{ publishedAt: { order: 'asc' } }] }
        : orderBy === 'dateDesc'
        ? { sort: [{ publishedAt: { order: 'desc' } }] }
        : {}),
      aggs: {
        channelIds: {
          terms: {
            field: 'channelId',
            size: 100,
          },
        },
        minPublishedAt: {
          min: {
            field: 'publishedAt',
          },
        },
        maxPublishedAt: {
          max: {
            field: 'publishedAt',
          },
        },
      },
    },
  ];
}

export function msearchChannels(
  query: string,
  from = 0,
  size = 0,
): [MsearchRequestItem, MsearchRequestItem] {
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
): [MsearchRequestItem, MsearchRequestItem] {
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

export const UploadHitSourceSchema = z.object({
  title: z.string(),
});

export const UploadHitHighlightSchema = z.object({
  title: z.array(z.string()),
});

export const TranscriptHitSchema = z.object({
  ...BaseHitSchema,
  _index: z.literal('lc_transcripts'),
  inner_hits: z.object({
    segments: z.object({
      hits: z.object({
        total: z.object({
          value: z.number(),
          relation: z.string(),
        }),
        max_score: z.number(),
        hits: z.array(
          z.object({
            ...BaseHitSchema,
            _index: z.literal('lc_transcripts'),
            _nested: z.object({
              field: z.literal('segments'),
              offset: z.number(),
            }),
            _source: z.object({
              start: z.number(),
              end: z.number(),
              text: z.string(),
            }),
            highlight: z.object({
              'segments.text': z.array(z.string()),
            }),
          }),
        ),
      }),
    }),
  }),
});

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

export const UploadHitSchema = z.object({
  ...BaseHitSchema,
  _index: z.literal('lc_uploads_v2'),
  _source: UploadHitSourceSchema,
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
      hits: z
        .object({
          total: z.object({ value: z.number(), relation: z.string() }),
          hits: z.array(
            z.discriminatedUnion('_index', [
              TranscriptHitSchema,
              UploadHitSchema,
              ChannelHitSchema,
              OrganizationHitSchema,
            ]),
          ),
        })
        .optional(),
      aggregations: z
        .object({
          channelIds: z
            .object({
              doc_count_error_upper_bound: z.number(),
              sum_other_doc_count: z.number(),
              buckets: z.array(
                z.object({
                  key: z.string().uuid(),
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

export async function* listIds(
  index:
    | 'lc_uploads_v2'
    | 'lc_transcripts'
    | 'lc_channels'
    | 'lc_organizations',
) {
  const searchRes = await client.search({
    index,
    scroll: '10m',
    size: 1000,
    body: {
      query: { match_all: {} },
    },
  });

  let scrollId = searchRes._scroll_id;
  let hits = searchRes.hits.hits;

  while (hits && hits.length && scrollId) {
    for (const { _id: id } of hits) {
      if (id) {
        yield id;
      }
    }

    const scrollRes = await client.scroll({
      scroll_id: scrollId,
      scroll: '10m',
    });
    scrollId = scrollRes._scroll_id;
    hits = scrollRes.hits.hits;
  }
}
