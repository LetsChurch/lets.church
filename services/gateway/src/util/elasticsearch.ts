import { Client } from '@elastic/elasticsearch';
import type { MsearchRequestItem } from '@elastic/elasticsearch/lib/api/types';
import envariant from '@knpwrs/envariant';
import waitOn from 'wait-on';
import * as Z from 'zod';
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
): Array<MsearchRequestItem> {
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
    },
  ];
}

export function msearchTranscripts(
  query: string,
  from = 0,
  size = 0,
): Array<MsearchRequestItem> {
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
            span_near: {
              clauses: query.split(/\s+/g).map((w) => ({
                span_multi: {
                  match: {
                    fuzzy: {
                      'segments.text': {
                        value: w,
                        fuzziness: w.length > 4 ? 2 : 1,
                      },
                    },
                  },
                },
              })),
              slop: 5,
              in_order: true,
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
    },
  ];
}

export function msearchChannels(
  query: string,
  from = 0,
  size = 0,
): Array<MsearchRequestItem> {
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
): Array<MsearchRequestItem> {
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
    }),
  ),
});
