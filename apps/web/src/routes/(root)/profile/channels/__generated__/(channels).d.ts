import * as Types from '../../../../../__generated__/graphql-types.d';

export type MyChannelsQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type MyChannelsQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', channelMembershipsConnection: { __typename?: 'AppUserChannelMembershipsConnection', edges: Array<{ __typename?: 'AppUserChannelMembershipsConnectionEdge', node: { __typename?: 'ChannelMembership', channel: { __typename?: 'Channel', id: any, name: string } } } | null> } } | null };
