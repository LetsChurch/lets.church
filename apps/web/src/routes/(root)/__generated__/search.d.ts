import * as Types from '../../../__generated__/graphql-types';

export type SearchUploadRecordPropsFragment = { __typename?: 'UploadRecord', title?: string | null, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, variants: Array<Types.UploadVariant>, channel: { __typename?: 'Channel', id: any, name: string } };

export type SearchQueryVariables = Types.Exact<{
  query: Types.Scalars['String'];
  focus: Types.SearchFocus;
  first?: Types.InputMaybe<Types.Scalars['Int']>;
  after?: Types.InputMaybe<Types.Scalars['String']>;
  last?: Types.InputMaybe<Types.Scalars['Int']>;
  before?: Types.InputMaybe<Types.Scalars['String']>;
}>;


export type SearchQuery = { __typename?: 'Query', search: { __typename?: 'SearchConnection', aggs: { __typename?: 'SearchAggs', uploadHitCount: number, channelHitCount: number, organizationHitCount: number, transcriptHitCount: number }, pageInfo: { __typename?: 'PageInfo', endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null }, edges: Array<{ __typename?: 'SearchConnectionEdge', cursor: string, node: { __typename: 'ChannelSearchHit', id: any } | { __typename: 'OrganizationSearchHit', id: any } | { __typename: 'TranscriptSearchHit', id: any, hits: Array<{ __typename?: 'TranscriptSearchInnerHit', start: number, end: number, text: { __typename?: 'HighlightedText', marked: string } }>, uploadRecord: { __typename?: 'UploadRecord', title?: string | null, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, variants: Array<Types.UploadVariant>, channel: { __typename?: 'Channel', id: any, name: string } } } | { __typename: 'UploadSearchHit', title: string, id: any, uploadRecord: { __typename?: 'UploadRecord', title?: string | null, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, variants: Array<Types.UploadVariant>, channel: { __typename?: 'Channel', id: any, name: string } } } }> } };
