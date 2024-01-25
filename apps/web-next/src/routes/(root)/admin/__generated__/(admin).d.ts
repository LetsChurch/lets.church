import * as Types from '../../../../__generated__/graphql-types';

export type AdminRootRouteQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type AdminRootRouteQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', username: string } | null };
