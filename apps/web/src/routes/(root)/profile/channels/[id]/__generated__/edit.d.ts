import * as Types from '../../../../../../__generated__/graphql-types';

export type ProfileChannelQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
}>;


export type ProfileChannelQuery = { __typename?: 'Query', channelById: { __typename?: 'Channel', id: string, name: string } };

export type UpdateChannelMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ShortUuid'];
  name: Types.Scalars['String'];
}>;


export type UpdateChannelMutation = { __typename?: 'Mutation', updateChannel: { __typename?: 'Channel', id: string } };
