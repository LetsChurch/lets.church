import { resolveOffsetConnection } from '@pothos/plugin-relay';
import { getProperty as get } from 'dot-prop';
import {
  msearchChannels,
  msearchOrganizations,
  MSearchResponseSchema,
  msearchTranscripts,
} from '../../util/elasticsearch';
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
    text: t.field({ type: HighlightedText }),
    moreResultsCount: t.int(),
  }),
});

builder.simpleObject('ChannelSearchHit', {
  interfaces: [ISearchHit],
  isTypeOf: (value) => valueIsKind(value, 'ChannelSearchHit'),
  fields: (t) => ({
    name: t.field({ type: HighlightedText }),
    // TODO
    // description: t.field({ type: HighlightedText }),
  }),
});

builder.simpleObject('OrganizationSearchHit', {
  interfaces: [ISearchHit],
  isTypeOf: (value) => valueIsKind(value, 'OrganizationSearchHit'),
  fields: (t) => ({
    name: t.field({ type: HighlightedText }),
    // TODO
    // description: t.field({ type: HighlightedText }),
  }),
});

const SearchAggs = builder.simpleObject('SearchAggs', {
  fields: (t) => ({
    transcriptHitCount: t.int(),
    channelHitCount: t.int(),
    organizationHitCount: t.int(),
  }),
});

const focuses = ['TRANSCRIPTS', 'CHANNELS', 'ORGANIZATIONS'] as const;

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
      },
      resolve: async (
        _root,
        { query, focus, ...args },
        { esClient },
        _info,
      ) => {
        let totalCount = 0;
        let transcriptHitCount = 0;
        let channelHitCount = 0;
        let organizationHitCount = 0;

        const res = await resolveOffsetConnection(
          { args },
          async ({ offset, limit }) => {
            const esRes = await esClient.msearch({
              searches: [
                ...msearchTranscripts(
                  query,
                  focus === 'TRANSCRIPTS' ? offset : 0,
                  focus === 'TRANSCRIPTS' ? limit : 0,
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
            transcriptHitCount = parsed.responses[0]?.hits.total.value ?? 0;
            channelHitCount = parsed.responses[1]?.hits.total.value ?? 0;
            organizationHitCount = parsed.responses[2]?.hits.total.value ?? 0;

            return parsed.responses
              .flatMap(({ hits: { hits } }) => hits)
              .map((hit) => ({
                __typename:
                  focus === 'TRANSCRIPTS'
                    ? 'TranscriptSearchHit'
                    : focus === 'CHANNELS'
                    ? 'ChannelSearchHit'
                    : 'OrganizationSearchHit',
                id: hit._id,
                ...(hit._index === 'lc_transcripts'
                  ? {
                      moreResultsCount:
                        hit.inner_hits.segments.hits.total.value - 1,
                      text: {
                        source:
                          hit.inner_hits.segments.hits.hits[0]?._source.text,
                        marked:
                          hit.inner_hits.segments.hits.hits[0]?.highlight[
                            'segments.text'
                          ][0],
                      },
                    }
                  : hit._index === 'lc_channels' ||
                    hit._index === 'lc_organizations'
                  ? {
                      name: {
                        source: hit._source.name,
                        marked: hit.highlight.name[0],
                      },
                    }
                  : (null as never)),
              }));
          },
        );

        return {
          ...res,
          totalCount,
          aggs: {
            transcriptHitCount,
            channelHitCount,
            organizationHitCount,
          },
        };
      },
    },
    {
      name: 'SearchConnection',
      fields: (t) => ({
        aggs: t.field({ type: SearchAggs, resolve: (root) => root.aggs }),
      }),
    },
  ),
}));
