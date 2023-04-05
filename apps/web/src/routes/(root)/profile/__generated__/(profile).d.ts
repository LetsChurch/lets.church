import * as Types from '../../../../__generated__/graphql-types';

export type ProfilePageDataQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type ProfilePageDataQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', id: string, username: string, fullName?: string | null, email: string } | null };

export type UpdateUserMutationVariables = Types.Exact<{
  userId: Types.Scalars['ShortUuid'];
  fullName: Types.Scalars['String'];
  email: Types.Scalars['String'];
}>;


export type UpdateUserMutation = { __typename?: 'Mutation', updateUser: { __typename?: 'AppUser', id: string } };
