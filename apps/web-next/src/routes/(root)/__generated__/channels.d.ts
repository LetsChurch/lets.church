import * as Types from '../../../__generated__/graphql-types';

export type ChannelsListQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type ChannelsListQuery = { __typename?: 'Query', channelsConnection: { __typename?: 'QueryChannelsConnection', edges: Array<{ __typename?: 'QueryChannelsConnectionEdge', node: { __typename?: 'Channel', name: string, slug: string } }> } };
