import * as Types from '../../__generated__/graphql-types.d';

export type MeQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', id: any } | null };
