import * as Types from '../../../../__generated__/graphql-types';

export type AdminUsersRouteRowPropsFragment = { __typename?: 'AppUser', id: string, username: string, role: Types.AppUserRole, fullName?: string | null, emails: Array<{ __typename?: 'AppUserEmail', email: string }> };

export type AdminUsersRouteQueryVariables = Types.Exact<{
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
  before?: Types.InputMaybe<Types.Scalars['String']['input']>;
  first?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  last?: Types.InputMaybe<Types.Scalars['Int']['input']>;
}>;


export type AdminUsersRouteQuery = { __typename?: 'Query', usersConnection: { __typename?: 'QueryUsersConnection', pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null, endCursor?: string | null }, edges: Array<{ __typename?: 'QueryUsersConnectionEdge', node: { __typename?: 'AppUser', id: string, username: string, role: Types.AppUserRole, fullName?: string | null, emails: Array<{ __typename?: 'AppUserEmail', email: string }> } }> } };
