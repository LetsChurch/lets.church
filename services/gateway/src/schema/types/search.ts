import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { getProperty as get } from 'dot-prop';
import { max, min } from 'lodash-es';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import pFilter from 'p-filter';
import { OrganizationType } from '@prisma/client';
import {
  msearchChannels,
  msearchOrganizations,
  MSearchResponseSchema,
  msearchTranscripts,
  msearchUploads,
  client as esClient,
} from '../../util/elasticsearch';
import prisma from '../../util/prisma';
import { identifiableSchema } from '../../util/zod';
import builder from '../builder';
import logger from '../../util/logger';
import { OrganizationTypeEnum } from './organization';

// TODO: ensure all aggregates are returned for every focus

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
  dateAggData: { min: Date; max: Date } | null;
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

const SearchPublishedAtAggData = builder.objectRef<{
  min: Date;
  max: Date;
}>('SearchPublishedAtAggData');

const SearchPublishedAtAgg = builder.objectType(SearchPublishedAtAggData, {
  fields: (t) => ({
    min: t.field({
      type: 'DateTime',
      resolve: (root) => root.min.toISOString(),
    }),
    max: t.field({
      type: 'DateTime',
      resolve: (root) => root.max.toISOString(),
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
    publishedAtRange: t.field({
      type: SearchPublishedAtAgg,
      nullable: true,
      resolve: (root) => root.dateAggData,
    }),
  }),
});

const focuses = [
  'UPLOADS',
  'TRANSCRIPTS',
  'CHANNELS',
  'ORGANIZATIONS',
] as const;

const orderByValues = ['avg', 'sum', 'date', 'dateDesc'] as const;
const OrderByEnum = z.enum(orderByValues);

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
        orderBy: t.arg({
          required: false,
          type: builder.enumType('SearchOrder', {
            values: orderByValues,
          }),
          defaultValue: 'avg',
        }),
        channels: t.arg({
          required: false,
          type: ['String'],
        }),
        minPublishedAt: t.arg({
          required: false,
          type: 'DateTime',
        }),
        maxPublishedAt: t.arg({
          required: false,
          type: 'DateTime',
        }),
        transcriptPhraseSearch: t.arg({
          required: false,
          type: 'Boolean',
        }),
        geo: t.arg({
          required: false,
          type: builder.inputType('GeoInput', {
            fields: (t) => ({
              lat: t.float({ required: true }),
              lon: t.float({ required: true }),
              range: t.string({ required: true }),
            }),
          }),
        }),
        orgType: t.arg({
          required: false,
          type: OrganizationTypeEnum,
          defaultValue: 'CHURCH',
        }),
        organization: t.arg({
          required: false,
          type: 'ShortUuid',
        }),
        tags: t.arg({ type: ['String'], required: false }),
      },
      validate: {
        schema: z
          .object({
            query: z.string(),
            focus: z.enum(focuses),
            channels: z.array(z.string()).max(10).nullable().optional(),
            minPublishedAt: z.string().or(z.date()).nullable().optional(),
            maxPublishedAt: z.string().or(z.date()).nullable().optional(),
            transcriptPhraseSearch: z.boolean().nullable().optional(),
            orgType: z.nativeEnum(OrganizationType).nullable().optional(),
          })
          .passthrough()
          // TODO: validate geo and denomination against focus
          .refine(
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
        {
          query,
          focus,
          channels,
          minPublishedAt,
          maxPublishedAt,
          transcriptPhraseSearch,
          geo,
          orgType,
          organization,
          tags,
          ...args
        },
        context,
        _info,
      ) => {
        let totalCount = 0;
        let uploadHitCount = 0;
        let transcriptHitCount = 0;
        let channelHitCount = 0;
        let organizationHitCount = 0;
        let channelAggData: Array<{ id: string; count: number }> = [];
        let dateAggData: { min: Date; max: Date } | null = null;

        const publishedAt: { lte?: string; gte?: string } = {};
        const orderBy = OrderByEnum.parse(args.orderBy ?? 'avg');

        if (minPublishedAt) {
          publishedAt.gte =
            minPublishedAt instanceof Date
              ? minPublishedAt.toISOString()
              : minPublishedAt;
        }

        if (maxPublishedAt) {
          publishedAt.lte =
            maxPublishedAt instanceof Date
              ? maxPublishedAt.toISOString()
              : maxPublishedAt;
        }

        const appUserId = context.session?.appUserId;
        const channelIds = channels
          ? (
              await pFilter(
                await prisma.channel.findMany({
                  where: { slug: { in: channels } },
                  select: { id: true, visibility: true },
                }),
                async (channel) => {
                  if (
                    channel.visibility === 'PUBLIC' ||
                    channel.visibility === 'UNLISTED'
                  ) {
                    return true;
                  }

                  return Boolean(
                    appUserId &&
                      (await prisma.channelMembership.findFirst({
                        where: { channelId: channel.id, appUserId },
                      })),
                  );
                },
              )
            ).map(({ id }) => id)
          : null;

        const res = await resolveOffsetConnection(
          { args },
          async ({ offset, limit }) => {
            const esRes = await esClient.msearch({
              searches: [
                ...msearchUploads(
                  query,
                  focus === 'UPLOADS' ? offset : 0,
                  focus === 'UPLOADS' ? limit : 0,
                  {
                    channelIds,
                    publishedAt,
                    orderBy,
                  },
                ),
                ...msearchTranscripts(
                  query,
                  focus === 'TRANSCRIPTS' ? offset : 0,
                  focus === 'TRANSCRIPTS' ? limit : 0,
                  {
                    channelIds,
                    publishedAt,
                    orderBy,
                    phrase: transcriptPhraseSearch ?? true,
                  },
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
                  {
                    geo: geo ? geo : null,
                    orgType: orgType ? orgType : null,
                    organization: organization ? organization : null,
                    tags: Array.isArray(tags) && tags.length > 0 ? tags : null,
                  },
                ),
              ],
            });

            const UPLOADS_MSEARCH_INDEX = 0;
            const TRANSCRIPTS_MSEARCH_INDEX = 1;
            const CHANNELS_MSEARCH_INDEX = 2;
            const ORGANIZATIONS_MSEARCH_INDEX = 3;

            const parseRes = MSearchResponseSchema.safeParse(esRes);

            if (!parseRes.success) {
              logger.error('Error parsing msearch response', {
                res: JSON.stringify({ esRes, parseRes }),
              });
              throw parseRes.error;
            }

            const parsed = parseRes.data;

            totalCount = parsed.responses.reduce(
              (sum, res) => sum + res.hits.total.value,
              0,
            );
            uploadHitCount = parsed.responses[0]?.hits.total.value ?? 0;
            transcriptHitCount = parsed.responses[1]?.hits.total.value ?? 0;
            channelHitCount = parsed.responses[2]?.hits.total.value ?? 0;
            organizationHitCount = parsed.responses[3]?.hits.total.value ?? 0;

            const focusedResponse =
              parsed.responses[
                focus === 'UPLOADS'
                  ? UPLOADS_MSEARCH_INDEX
                  : focus === 'TRANSCRIPTS'
                  ? TRANSCRIPTS_MSEARCH_INDEX
                  : focus === 'CHANNELS'
                  ? CHANNELS_MSEARCH_INDEX
                  : ORGANIZATIONS_MSEARCH_INDEX
              ];
            invariant(focusedResponse, 'Focused response should exist');

            const uploadAggs =
              parsed.responses[UPLOADS_MSEARCH_INDEX]?.aggregations;
            const transcriptAggs =
              parsed.responses[TRANSCRIPTS_MSEARCH_INDEX]?.aggregations;

            // Get focused aggregrate value
            const allChannelAggData = (
              focus === 'UPLOADS' || focus === 'TRANSCRIPTS'
                ? [
                    ...(uploadAggs?.channelIds?.buckets ?? []),
                    ...(transcriptAggs?.channelIds?.buckets ?? []),
                  ]
                : []
            )
              .map(({ key, doc_count }) => ({ id: key, count: doc_count }))
              // Ensure any extra channels passed in are accounted for
              .concat(channelIds?.map((id) => ({ id, count: 0 })) ?? []);

            // Filter out private or unlisted channels
            const validChannels = await prisma.channel.findMany({
              select: { id: true },
              where: {
                id: { in: allChannelAggData.map(({ id }) => id) },
                OR: [
                  {
                    visibility: 'PUBLIC',
                  },
                  ...(appUserId
                    ? [
                        {
                          memberships: {
                            some: {
                              appUserId,
                            },
                          },
                        },
                      ]
                    : []),
                ],
              },
            });

            channelAggData = validChannels.map((channel) => ({
              ...channel,
              count:
                allChannelAggData.find((agg) => agg.id === channel.id)?.count ??
                0,
            }));

            const minDate = min([
              uploadAggs?.minPublishedAt?.value,
              transcriptAggs?.minPublishedAt?.value,
              // Ensure out of range date is accounted for
              minPublishedAt,
            ]);
            const maxDate = max([
              uploadAggs?.maxPublishedAt?.value,
              transcriptAggs?.maxPublishedAt?.value,
              // Ensure out of range date is accounted for
              maxPublishedAt,
            ]);

            dateAggData =
              minDate && maxDate
                ? {
                    min: new Date(minDate),
                    max: new Date(maxDate),
                  }
                : null;

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
                ...(hit._index === 'lc_uploads_v2'
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
                          marked: h.highlight['segments.text'].join(' ') ?? '',
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
            dateAggData,
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
