import { Client } from '@elastic/elasticsearch';
import type { MsearchRequestItem } from '@elastic/elasticsearch/lib/api/types';
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

export function msearchUploads(
  query: string,
  from = 0,
  size = 0,
  { channels = [] }: { channels?: string[] | null | undefined },
): [MsearchRequestItem, MsearchRequestItem] {
  return [
    { index: 'lc_uploads' },
    {
      from,
      size,
      query: {
        multi_match: {
          query,
          type: 'bool_prefix',
          fields: ['title^3', 'title._2gram', 'title._3gram', 'description'],
        },
      },
      ...(Array.isArray(channels) && channels.length > 0
        ? { post_filter: { terms: { channelId: channels } } }
        : {}),
    },
  ];
}

export function msearchTranscripts(
  query: string,
  from = 0,
  size = 0,
  { channels = [] }: { channels?: string[] | null | undefined },
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
        nested: {
          path: 'segments',
          query: {
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
      ...(Array.isArray(channels) && channels.length > 0
        ? { post_filter: { terms: { channelId: channels } } }
        : {}),
      aggs: {
        channelIds: {
          terms: {
            field: 'channelId',
            size: 10,
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
  _score: Z.number(),
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
      }).optional(),
    }),
  ),
});
