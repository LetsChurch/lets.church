import * as Types from '../../../../../__generated__/graphql-types';

export type AdminOrganizationEditRouteDataQueryVariables = Types.Exact<{
  id?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  prefetch: Types.Scalars['Boolean']['input'];
}>;


export type AdminOrganizationEditRouteDataQuery = { __typename?: 'Query', organizationById?: { __typename?: 'Organization', id: string, type: Types.OrganizationType, name: string, slug: string } };

export type AdminUpsertOrganizationMutationVariables = Types.Exact<{
  organizationId?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  name: Types.Scalars['String']['input'];
  slug: Types.Scalars['String']['input'];
  description?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type AdminUpsertOrganizationMutation = { __typename?: 'Mutation', upsertOrganization: { __typename?: 'Organization', id: string } };
