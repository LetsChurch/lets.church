import * as Types from '../../../__generated__/graphql-types';

export type SearchQueryVariables = Types.Exact<{
  query: Types.Scalars['String'];
}>;


export type SearchQuery = { __typename?: 'Query', search: { __typename?: 'SearchConnection', aggs: { __typename?: 'SearchAggs', channelHitCount: number, organizationHitCount: number, transcriptHitCount: number }, edges: Array<{ __typename?: 'SearchConnectionEdge', cursor: string, node: { __typename?: 'ChannelSearchHit', id: any } | { __typename?: 'OrganizationSearchHit', id: any } | { __typename?: 'TranscriptSearchHit', id: any, moreResultsCount: number, text: { __typename?: 'HighlightedText', marked: string, source: string } } }> } };
