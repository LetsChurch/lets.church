import * as Types from '../../../../__generated__/graphql-types';

export type PublicChannelQueryVariables = Types.Exact<{
  slug: Types.Scalars['String'];
  first?: Types.InputMaybe<Types.Scalars['Int']>;
  after?: Types.InputMaybe<Types.Scalars['String']>;
  last?: Types.InputMaybe<Types.Scalars['Int']>;
  before?: Types.InputMaybe<Types.Scalars['String']>;
}>;


export type PublicChannelQuery = { __typename?: 'Query', channelBySlug: { __typename?: 'Channel', id: string, name: string, avatarUrl?: string | null, uploadsConnection: { __typename?: 'ChannelUploadsConnection', totalCount: number, pageInfo: { __typename?: 'PageInfo', startCursor?: string | null, endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean }, edges: Array<{ __typename?: 'ChannelUploadsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, channel: { __typename?: 'Channel', id: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null, defaultThumbnailBlurhash?: string | null } } }> } } };
