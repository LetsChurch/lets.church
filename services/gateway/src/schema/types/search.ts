import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { getProperty as get } from 'dot-prop';
import * as Z from 'zod';
import {
  msearchChannels,
  msearchOrganizations,
  MSearchResponseSchema,
  msearchTranscripts,
  msearchUploads,
} from '../../util/elasticsearch';
import prisma from '../../util/prisma';
import { identifiableSchema } from '../../util/zod';
import builder from '../builder';

const HighlightedText = builder.simpleObject('HighlightedText', {
  fields: (t) => ({ source: t.string(), marked: t.string() }),
});

const ISearchHit = builder.simpleInterface('ISearchHit', {
  fields: (t) => ({
    id: t.field({ type: 'ShortUuid' }),
  }),
});

function valueIsKind(value: unknown, typename: string) {
  return get(value, '__typename') === typename;
}

builder.simpleObject('TranscriptSearchHit', {
  interfaces: [ISearchHit],
  isTypeOf: (value) => valueIsKind(value, 'TranscriptSearchHit'),
  fields: (t) => ({
    hits: t.field({
      type: [
        builder.simpleObject('TranscriptSearchInnerHit', {
          fields: (t) => ({
            start: t.int(),
            end: t.int(),
            text: t.field({ type: HighlightedText }),
          }),
        }),
      ],
    }),
    // TODO: this isn't batching
    uploadRecord: t.prismaField({
      type: 'UploadRecord',
      resolve: async (query, root, _args, _context, _info) =>
        prisma.uploadRecord.findUniqueOrThrow({
          ...query,
          where: identifiableSchema.parse(root),
        }),
    }),
  }),
});

builder.simpleObject('UploadSearchHit', {
  interfaces: [ISearchHit],
  isTypeOf: (value) => valueIsKind(value, 'UploadSearchHit'),
  fields: (t) => ({
    title: t.string(),
    // TODO
    // description: t.string(),
    // TODO: this isn't batching
    uploadRecord: t.prismaField({
      type: 'UploadRecord',
      resolve: async (query, root, _args, _context, _info) =>
        prisma.uploadRecord.findUniqueOrThrow({
          ...query,
          where: identifiableSchema.parse(root),
        }),
    }),
  }),
});

builder.simpleObject('ChannelSearchHit', {
  interfaces: [ISearchHit],
  isTypeOf: (value) => valueIsKind(value, 'ChannelSearchHit'),
  fields: (t) => ({
    name: t.string(),
    // TODO
    // description: t.string(),
    channel: t.prismaField({
      type: 'Channel',
      resolve: async (query, root, _args, _context, _info) =>
        prisma.channel.findUniqueOrThrow({
          ...query,
          where: identifiableSchema.parse(root),
        }),
    }),
  }),
});

builder.simpleObject('OrganizationSearchHit', {
  interfaces: [ISearchHit],
  isTypeOf: (value) => valueIsKind(value, 'OrganizationSearchHit'),
  fields: (t) => ({
    name: t.string(),
    // TODO
    // description: t.string(),
    organization: t.prismaField({
      type: 'Organization',
      resolve: async (query, root, _args, _context, _info) =>
        prisma.organization.findUniqueOrThrow({
          ...query,
          where: identifiableSchema.parse(root),
        }),
    }),
  }),
});

const SearchAggsData = builder.objectRef<{
  uploadHitCount: number;
  transcriptHitCount: number;
  channelHitCount: number;
  organizationHitCount: number;
  channelAggData: Array<{ id: string; count: number }>;
}>('SearchAggsData');

const SearchChannelAggData = builder.objectRef<{
  id: string;
  count: number;
}>('SearchChannelAgg');

const SearchChannelAgg = builder.objectType(SearchChannelAggData, {
  name: 'SearchChannelAgg',
  fields: (t) => ({
    count: t.exposeInt('count'),
    // TODO: is this batching?
    channel: t.prismaField({
      type: 'Channel',
      resolve: async (query, root, _args, _context, _info) =>
        prisma.channel.findUniqueOrThrow({
          ...query,
          where: { id: root.id },
        }),
    }),
  }),
});

const SearchAggs = builder.objectType(SearchAggsData, {
  name: 'SearchAggs',
  fields: (t) => ({
    uploadHitCount: t.exposeInt('uploadHitCount'),
    transcriptHitCount: t.exposeInt('transcriptHitCount'),
    channelHitCount: t.exposeInt('channelHitCount'),
    organizationHitCount: t.exposeInt('organizationHitCount'),
    channels: t.field({
      type: [SearchChannelAgg],
      resolve: (root) => root.channelAggData,
    }),
  }),
});

const focuses = [
  'UPLOADS',
  'TRANSCRIPTS',
  'CHANNELS',
  'ORGANIZATIONS',
] as const;

builder.queryFields((t) => ({
  search: t.connection(
    {
      type: ISearchHit,
      args: {
        query: t.arg.string({ required: true }),
        focus: t.arg({
          required: true,
          type: builder.enumType('SearchFocus', {
            values: focuses,
          }),
        }),
        channels: t.arg({
          required: false,
          type: ['ShortUuid'],
        }),
      },
      validate: {
        schema: Z.object({
          query: Z.string(),
          focus: Z.enum(focuses),
          channels: Z.array(Z.string().uuid()).nullable().optional(),
        }).refine(
          (val) =>
            val.channels?.length ?? 0 > 0
              ? val.focus === 'UPLOADS' || val.focus === 'TRANSCRIPTS'
              : true,
          {
            message:
              '`channels` can only be included if focus is `UPLOADS` or `TRANSCRIPTS`',
          },
        ),
      },
      resolve: async (
        _root,
        { query, focus, channels, ...args },
        { esClient },
        _info,
      ) => {
        let totalCount = 0;
        let uploadHitCount = 0;
        let transcriptHitCount = 0;
        let channelHitCount = 0;
        let organizationHitCount = 0;
        let channelAggData: Array<{ id: string; count: number }> = [];

        const res = await resolveOffsetConnection(
          { args },
          async ({ offset, limit }) => {
            const esRes = await esClient.msearch({
              searches: [
                ...msearchUploads(
                  query,
                  focus === 'UPLOADS' ? offset : 0,
                  focus === 'UPLOADS' ? limit : 0,
                  { channels },
                ),
                ...msearchTranscripts(
                  query,
                  focus === 'TRANSCRIPTS' ? offset : 0,
                  focus === 'TRANSCRIPTS' ? limit : 0,
                  { channels },
                ),
                ...msearchChannels(
                  query,
                  focus === 'CHANNELS' ? offset : 0,
                  focus === 'CHANNELS' ? limit : 0,
                ),
                ...msearchOrganizations(
                  query,
                  focus === 'ORGANIZATIONS' ? offset : 0,
                  focus === 'ORGANIZATIONS' ? limit : 0,
                ),
              ],
            });

            const parsed = MSearchResponseSchema.parse(esRes);

            totalCount = parsed.responses.reduce(
              (sum, res) => sum + res.hits.total.value,
              0,
            );
            uploadHitCount = parsed.responses[0]?.hits.total.value ?? 0;
            transcriptHitCount = parsed.responses[1]?.hits.total.value ?? 0;
            channelHitCount = parsed.responses[2]?.hits.total.value ?? 0;
            organizationHitCount = parsed.responses[3]?.hits.total.value ?? 0;

            channelAggData = parsed.responses
              .flatMap((res) => res.aggregations?.channelIds?.buckets ?? [])
              .map(({ key, doc_count }) => ({ id: key, count: doc_count }));

            const res = parsed.responses
              .flatMap(({ hits: { hits } }) => hits)
              .map((hit) => ({
                __typename:
                  focus === 'UPLOADS'
                    ? 'UploadSearchHit'
                    : focus === 'TRANSCRIPTS'
                    ? 'TranscriptSearchHit'
                    : focus === 'CHANNELS'
                    ? 'ChannelSearchHit'
                    : 'OrganizationSearchHit',
                id: hit._id,
                ...(hit._index === 'lc_uploads'
                  ? {
                      uploadRecord: { id: hit._id },
                      title: hit._source.title,
                    }
                  : hit._index === 'lc_transcripts'
                  ? {
                      uploadRecord: { id: hit._id },
                      hits: hit.inner_hits.segments.hits.hits.map((h) => ({
                        start: h._source.start,
                        end: h._source.end,
                        text: {
                          source: h._source.text,
                          marked: h.highlight['segments.text'][0] ?? '',
                        },
                      })),
                    }
                  : hit._index === 'lc_channels'
                  ? {
                      channel: { id: hit._id },
                      name: hit._source.name,
                    }
                  : hit._index === 'lc_organizations'
                  ? {
                      organization: { id: hit._id },
                      name: hit._source.name,
                    }
                  : (null as never)),
              }));

            return res;
          },
        );

        return {
          ...res,
          totalCount,
          aggs: {
            uploadHitCount,
            transcriptHitCount,
            channelHitCount,
            organizationHitCount,
            channelAggData,
          },
        };
      },
    },
    {
      name: 'SearchConnection',
      fields: (t) => ({
        aggs: t.field({
          type: SearchAggs,
          resolve: ({ aggs }) => aggs,
        }),
      }),
    },
  ),
}));
