import * as Types from '../../../../__generated__/graphql-types';

export type AdminChannelsRouteRowPropsFragment = { __typename?: 'Channel', id: string, name: string, slug: string };

export type AdminChannelsRouteQueryVariables = Types.Exact<{
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
  before?: Types.InputMaybe<Types.Scalars['String']['input']>;
  first?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  last?: Types.InputMaybe<Types.Scalars['Int']['input']>;
}>;


export type AdminChannelsRouteQuery = { __typename?: 'Query', channelsConnection: { __typename?: 'QueryChannelsConnection', pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null, endCursor?: string | null }, edges: Array<{ __typename?: 'QueryChannelsConnectionEdge', node: { __typename?: 'Channel', id: string, name: string, slug: string } }> } };
