import * as Types from '../../__generated__/graphql-types';

export type MeQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type MeQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', id: string, avatarUrl?: string | null, canUpload: boolean, username: string, fullName?: string | null, subscribedToNewsletter: boolean, emails: Array<{ __typename?: 'AppUserEmail', email: string }> } | null };
