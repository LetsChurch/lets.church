import * as Types from '../../../__generated__/graphql-types';

export type ChannelsListQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type ChannelsListQuery = { __typename?: 'Query', channels: Array<{ __typename?: 'ChannelEntry', name: string, slug: string }> };
