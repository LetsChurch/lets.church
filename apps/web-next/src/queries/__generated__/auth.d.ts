import * as Types from '../../__generated__/graphql-types';

export type LoginMutationVariables = Types.Exact<{
  id: Types.Scalars['String']['input'];
  password: Types.Scalars['String']['input'];
}>;


export type LoginMutation = { __typename?: 'Mutation', login?: string | null };

export type MeQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', id: string, role: Types.AppUserRole, avatarUrl?: string | null, canUpload: boolean, username: string, fullName?: string | null, subscribedToNewsletter: boolean, emails: Array<{ __typename?: 'AppUserEmail', email: string }> } | null };
