import { Client } from '@elastic/elasticsearch';
import type {
  MsearchMultisearchBody,
  MsearchRequestItem,
  QueryDslQueryContainer,
} from '@elastic/elasticsearch/lib/api/types';
import envariant from '@knpwrs/envariant';
import waitOn from 'wait-on';
import * as Z from 'zod';
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
type OrderBy = 'avg' | 'sum' | 'date';

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
  return [
    { index: 'lc_uploads' },
    {
      from,
      size,
      query: {
        bool: {
          should: [],
          must: [
            { term: { visibility: 'PUBLIC' } },
            { exists: { field: 'transcodingFinishedAt' } },
            { exists: { field: 'transcribingFinishedAt' } },
            {
              multi_match: {
                query,
                type: 'bool_prefix',
                fields: [
                  'title^3',
                  'title._2gram',
                  'title._3gram',
                  'description',
                ],
              },
            },
          ],
        },
      },
      ...makePostFilterSpread({ channelIds, publishedAt }),
      ...(orderBy === 'date'
        ? { sort: [{ publishedAt: { order: 'asc' } }] }
        : {}),
      aggs: {
        channelIds: {
          terms: {
            field: 'channelId',
            size: 10,
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
            {
              nested: {
                path: 'segments',
                score_mode: orderBy === 'sum' ? 'sum' : 'avg',
                query: phrase
                  ? {
                      match_phrase: {
                        'segments.text': {
                          query: trimmed,
                          slop: words.length > 3 ? 5 : 2,
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
        : {}),
      aggs: {
        channelIds: {
          terms: {
            field: 'channelId',
            size: 10,
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
        multi_match: {
          query,
          type: 'bool_prefix',
          fields: ['name^3', 'name._2gram', 'name._3gram'],
        },
      },
    },
  ];
}

export function msearchOrganizations(
  query: string,
  from = 0,
  size = 0,
): [MsearchRequestItem, MsearchRequestItem] {
  return [
    { index: 'lc_organizations' },
    {
      from,
      size,
      query: {
        multi_match: {
          query,
          type: 'bool_prefix',
          fields: ['name^3', 'name._2gram', 'name._3gram'],
        },
      },
    },
  ];
}

export const BaseHitSchema = {
  _id: Z.string(),
  _score: Z.number().nullable(),
};

export const UploadHitSourceSchema = Z.object({
  title: Z.string(),
});

export const UploadHitHighlightSchema = Z.object({
  title: Z.array(Z.string()),
});

export const TranscriptHitSchema = Z.object({
  ...BaseHitSchema,
  _index: Z.literal('lc_transcripts'),
  inner_hits: Z.object({
    segments: Z.object({
      hits: Z.object({
        total: Z.object({
          value: Z.number(),
          relation: Z.string(),
        }),
        max_score: Z.number(),
        hits: Z.array(
          Z.object({
            ...BaseHitSchema,
            _index: Z.literal('lc_transcripts'),
            _nested: Z.object({
              field: Z.literal('segments'),
              offset: Z.number(),
            }),
            _source: Z.object({
              start: Z.number(),
              end: Z.number(),
              text: Z.string(),
            }),
            highlight: Z.object({
              'segments.text': Z.array(Z.string()),
            }),
          }),
        ),
      }),
    }),
  }),
});

export const ChannelHitSourceSchema = Z.object({
  name: Z.string(),
});

export const ChannelHitHighlightSchema = Z.object({
  name: Z.array(Z.string()),
});

export const OrganizationHitSourceSchema = Z.object({
  name: Z.string(),
});

export const OrganizationHitHighlightSchema = Z.object({
  name: Z.array(Z.string()),
});

export const UploadHitSchema = Z.object({
  ...BaseHitSchema,
  _index: Z.literal('lc_uploads'),
  _source: UploadHitSourceSchema,
});

export const ChannelHitSchema = Z.object({
  ...BaseHitSchema,
  _index: Z.literal('lc_channels'),
  _source: ChannelHitSourceSchema,
});

export const OrganizationHitSchema = Z.object({
  ...BaseHitSchema,
  _index: Z.literal('lc_organizations'),
  _source: OrganizationHitSourceSchema,
});

export const MSearchResponseSchema = Z.object({
  took: Z.number(),
  responses: Z.array(
    Z.object({
      took: Z.number(),
      timed_out: Z.boolean(),
      _shards: Z.object({
        total: Z.number(),
        successful: Z.number(),
        skipped: Z.number(),
        failed: Z.number(),
      }),
      hits: Z.object({
        total: Z.object({ value: Z.number(), relation: Z.string() }),
        hits: Z.array(
          Z.discriminatedUnion('_index', [
            TranscriptHitSchema,
            UploadHitSchema,
            ChannelHitSchema,
            OrganizationHitSchema,
          ]),
        ),
      }),
      aggregations: Z.object({
        channelIds: Z.object({
          doc_count_error_upper_bound: Z.number(),
          sum_other_doc_count: Z.number(),
          buckets: Z.array(
            Z.object({
              key: Z.string().uuid(),
              doc_count: Z.number(),
            }),
          ),
        }).optional(),
        minPublishedAt: Z.object({
          value: Z.number().nullable(), // null when there are no matches
        }).optional(),
        maxPublishedAt: Z.object({
          value: Z.number().nullable(), // null when there are no matches
        }).optional(),
      }).optional(),
    }),
  ),
});

export async function* listIds(
  index: 'lc_uploads' | 'lc_transcripts' | 'lc_channels' | 'lc_organizations',
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
