import * as Types from '../../../../../../__generated__/graphql-types';

export type ProfileChannelsQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
  first?: Types.InputMaybe<Types.Scalars['Int']>;
  after?: Types.InputMaybe<Types.Scalars['String']>;
  last?: Types.InputMaybe<Types.Scalars['Int']>;
  before?: Types.InputMaybe<Types.Scalars['String']>;
}>;


export type ProfileChannelsQuery = { __typename?: 'Query', channelById: { __typename?: 'Channel', id: string, name: string, uploadsConnection: { __typename?: 'ChannelUploadsConnection', totalCount: number, pageInfo: { __typename?: 'PageInfo', startCursor?: string | null, endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean }, edges: Array<{ __typename?: 'ChannelUploadsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, createdAt: string, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null } }> } } };
