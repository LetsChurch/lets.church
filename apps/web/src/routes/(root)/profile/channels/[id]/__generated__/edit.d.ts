import * as Types from '../../../../../../__generated__/graphql-types';

export type ProfileChannelQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
}>;


export type ProfileChannelQuery = { __typename?: 'Query', channelById: { __typename?: 'Channel', id: string, name: string } };
