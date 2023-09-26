import * as Types from '../../../__generated__/graphql-types';

export type SearchQueryVariables = Types.Exact<{
  query: Types.Scalars['String']['input'];
  focus: Types.SearchFocus;
  first?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
  last?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  before?: Types.InputMaybe<Types.Scalars['String']['input']>;
  minPublishedAt?: Types.InputMaybe<Types.Scalars['DateTime']['input']>;
  maxPublishedAt?: Types.InputMaybe<Types.Scalars['DateTime']['input']>;
  orderBy?: Types.InputMaybe<Types.SearchOrder>;
  channels?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
  transcriptPhraseSearch?: Types.InputMaybe<Types.Scalars['Boolean']['input']>;
}>;


export type SearchQuery = { __typename?: 'Query', search: { __typename?: 'SearchConnection', aggs: { __typename?: 'SearchAggs', uploadHitCount: number, channelHitCount: number, organizationHitCount: number, transcriptHitCount: number, channels: Array<{ __typename?: 'SearchChannelAgg', count: number, channel: { __typename?: 'Channel', slug: string, name: string } }>, publishedAtRange?: { __typename?: 'SearchPublishedAtAggData', min: string, max: string } | null }, pageInfo: { __typename?: 'PageInfo', endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null }, edges: Array<{ __typename?: 'SearchConnectionEdge', cursor: string, node: { __typename: 'ChannelSearchHit', id: string } | { __typename: 'OrganizationSearchHit', id: string } | { __typename: 'TranscriptSearchHit', id: string, hits: Array<{ __typename?: 'TranscriptSearchInnerHit', start: number, end: number, text: { __typename?: 'HighlightedText', marked: string } }>, uploadRecord: { __typename?: 'UploadRecord', title?: string | null, publishedAt?: string | null, totalViews: number, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, variants: Array<Types.UploadVariant>, channel: { __typename?: 'Channel', id: string, slug: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null } } } | { __typename: 'UploadSearchHit', title: string, id: string, uploadRecord: { __typename?: 'UploadRecord', title?: string | null, publishedAt?: string | null, totalViews: number, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, variants: Array<Types.UploadVariant>, channel: { __typename?: 'Channel', id: string, slug: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null } } } }> } };
