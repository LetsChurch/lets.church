import * as Types from '../../../__generated__/graphql-types';

export type SearchUploadRecordPropsFragment = { __typename?: 'UploadRecord', title?: string | null, publishedAt?: string | null, totalViews: number, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, variants: Array<Types.UploadVariant>, channel: { __typename?: 'Channel', id: string, slug: string, name: string, avatarUrl?: string | null } };

export type SearchQueryVariables = Types.Exact<{
  query: Types.Scalars['String'];
  focus: Types.SearchFocus;
  first?: Types.InputMaybe<Types.Scalars['Int']>;
  after?: Types.InputMaybe<Types.Scalars['String']>;
  last?: Types.InputMaybe<Types.Scalars['Int']>;
  before?: Types.InputMaybe<Types.Scalars['String']>;
  minPublishedAt?: Types.InputMaybe<Types.Scalars['DateTime']>;
  maxPublishedAt?: Types.InputMaybe<Types.Scalars['DateTime']>;
  orderBy?: Types.InputMaybe<Types.SearchOrder>;
  channels?: Types.InputMaybe<Array<Types.Scalars['String']> | Types.Scalars['String']>;
  transcriptPhraseSearch?: Types.InputMaybe<Types.Scalars['Boolean']>;
}>;


export type SearchQuery = { __typename?: 'Query', search: { __typename?: 'SearchConnection', aggs: { __typename?: 'SearchAggs', uploadHitCount: number, channelHitCount: number, organizationHitCount: number, transcriptHitCount: number, channels: Array<{ __typename?: 'SearchChannelAgg', count: number, channel: { __typename?: 'Channel', slug: string, name: string } }>, publishedAtRange?: { __typename?: 'SearchPublishedAtAggData', min: string, max: string } | null }, pageInfo: { __typename?: 'PageInfo', endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null }, edges: Array<{ __typename?: 'SearchConnectionEdge', cursor: string, node: { __typename: 'ChannelSearchHit', id: string } | { __typename: 'OrganizationSearchHit', id: string } | { __typename: 'TranscriptSearchHit', id: string, hits: Array<{ __typename?: 'TranscriptSearchInnerHit', start: number, end: number, text: { __typename?: 'HighlightedText', marked: string } }>, uploadRecord: { __typename?: 'UploadRecord', title?: string | null, publishedAt?: string | null, totalViews: number, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, variants: Array<Types.UploadVariant>, channel: { __typename?: 'Channel', id: string, slug: string, name: string, avatarUrl?: string | null } } } | { __typename: 'UploadSearchHit', title: string, id: string, uploadRecord: { __typename?: 'UploadRecord', title?: string | null, publishedAt?: string | null, totalViews: number, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, variants: Array<Types.UploadVariant>, channel: { __typename?: 'Channel', id: string, slug: string, name: string, avatarUrl?: string | null } } } }> } };
