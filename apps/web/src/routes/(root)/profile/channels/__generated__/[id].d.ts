import * as Types from '../../../../../__generated__/graphql-types.d';

export type ChannelQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
  after?: Types.InputMaybe<Types.Scalars['String']>;
}>;


export type ChannelQuery = { __typename?: 'Query', channelById: { __typename?: 'Channel', name: string, uploadsConnection: { __typename?: 'ChannelUploadsConnection', edges: Array<{ __typename?: 'ChannelUploadsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: any, title?: string | null, createdAt: any } }> } } };
