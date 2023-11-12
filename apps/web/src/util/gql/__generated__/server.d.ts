import * as Types from '../../../__generated__/graphql-types';

export type AdminClientMeQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type AdminClientMeQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', role: Types.AppUserRole } | null };
