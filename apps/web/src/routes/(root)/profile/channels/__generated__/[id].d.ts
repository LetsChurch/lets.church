import * as Types from '../../../../../__generated__/graphql-types.d';

export type ChannelQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
}>;


export type ChannelQuery = { __typename?: 'Query', channelById: { __typename?: 'Channel', name: string } };
