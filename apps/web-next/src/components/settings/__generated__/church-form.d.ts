import * as Types from '../../../__generated__/graphql-types';

export type UpsertOrganizationMutationVariables = Types.Exact<{
  id?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  name: Types.Scalars['String']['input'];
  slug: Types.Scalars['String']['input'];
  about?: Types.InputMaybe<Types.Scalars['String']['input']>;
  websiteUrl?: Types.InputMaybe<Types.Scalars['String']['input']>;
  primaryEmail?: Types.InputMaybe<Types.Scalars['String']['input']>;
  primaryPhoneNumber?: Types.InputMaybe<Types.Scalars['String']['input']>;
  tags?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
  addresses?: Types.InputMaybe<Array<Types.AddressInput> | Types.AddressInput>;
  leaders?: Types.InputMaybe<Array<Types.OrganizationLeaderInput> | Types.OrganizationLeaderInput>;
  upstreamAssociations?: Types.InputMaybe<Array<Types.Scalars['ShortUuid']['input']> | Types.Scalars['ShortUuid']['input']>;
}>;


export type UpsertOrganizationMutation = { __typename?: 'Mutation', upsertOrganization: { __typename?: 'Organization', id: string } };

export type ChurchFormOrganizationTagsQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type ChurchFormOrganizationTagsQuery = { __typename?: 'Query', organizationTagsConnection: { __typename?: 'QueryOrganizationTagsConnection', edges: Array<{ __typename?: 'QueryOrganizationTagsConnectionEdge', node: { __typename?: 'OrganizationTag', slug: string, label: string } }> } };

export type ChurchFormAssociatableOrganizationsQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type ChurchFormAssociatableOrganizationsQuery = { __typename?: 'Query', organizationsConnection: { __typename?: 'QueryOrganizationsConnection', edges: Array<{ __typename?: 'QueryOrganizationsConnectionEdge', node: { __typename?: 'Organization', name: string, id: string } }> } };
