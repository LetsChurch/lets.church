import * as Types from '../../../../../__generated__/graphql-types';

export type AdminOrganizationsRouteRowPropsFragment = { __typename?: 'Organization', id: string, type: Types.OrganizationType, name: string, slug: string };

export type AdminOrganizationsRouteQueryVariables = Types.Exact<{
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
  before?: Types.InputMaybe<Types.Scalars['String']['input']>;
  first?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  last?: Types.InputMaybe<Types.Scalars['Int']['input']>;
}>;


export type AdminOrganizationsRouteQuery = { __typename?: 'Query', organizationsConnection: { __typename?: 'QueryOrganizationsConnection', pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null, endCursor?: string | null }, edges: Array<{ __typename?: 'QueryOrganizationsConnectionEdge', node: { __typename?: 'Organization', id: string, type: Types.OrganizationType, name: string, slug: string } }> } };
