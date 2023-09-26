import * as Types from '../../../../../../__generated__/graphql-types';

export type ProfileChannelsQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid']['input'];
  first?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
  last?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  before?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type ProfileChannelsQuery = { __typename?: 'Query', channelById: { __typename?: 'Channel', id: string, name: string, avatarUrl?: string | null, uploadsConnection: { __typename?: 'ChannelUploadsConnection', totalCount: number, pageInfo: { __typename?: 'PageInfo', startCursor?: string | null, endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean }, edges: Array<{ __typename?: 'ChannelUploadsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, channel: { __typename?: 'Channel', id: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null, defaultThumbnailBlurhash?: string | null } } }> } } };
