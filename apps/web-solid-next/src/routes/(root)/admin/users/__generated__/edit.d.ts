import * as Types from '../../../../../__generated__/graphql-types';

export type AdminUserEditRouteDataQueryVariables = Types.Exact<{
  id?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  prefetch: Types.Scalars['Boolean']['input'];
}>;


export type AdminUserEditRouteDataQuery = { __typename?: 'Query', userById?: { __typename?: 'AppUser', id: string, username: string, fullName?: string | null, role: Types.AppUserRole, emails: Array<{ __typename?: 'AppUserEmail', email: string }> } };

export type AdminUpsertUserMutationVariables = Types.Exact<{
  userId?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  username?: Types.InputMaybe<Types.Scalars['String']['input']>;
  fullName?: Types.InputMaybe<Types.Scalars['String']['input']>;
  email: Types.Scalars['String']['input'];
  role: Types.AppUserRole;
  newPassword?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type AdminUpsertUserMutation = { __typename?: 'Mutation', upsertUser: { __typename?: 'AppUser', id: string } };
