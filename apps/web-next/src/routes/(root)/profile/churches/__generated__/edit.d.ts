import * as Types from '../../../../../__generated__/graphql-types';

export type ProfileChurchEditRouteDataQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid']['input'];
}>;


export type ProfileChurchEditRouteDataQuery = { __typename?: 'Query', organizationById: { __typename?: 'Organization', id: string, name: string, slug: string, description?: string | null, primaryEmail?: string | null, primaryPhoneNumber?: string | null, tags: { __typename?: 'OrganizationTagsConnection', edges: Array<{ __typename?: 'OrganizationTagsConnectionEdge', node: { __typename?: 'OrganizationTagInstance', tag: { __typename?: 'OrganizationTag', slug: string } } }> }, addresses: { __typename?: 'OrganizationAddressesConnection', edges: Array<{ __typename?: 'OrganizationAddressesConnectionEdge', node: { __typename?: 'OrganizationAddress', type: Types.OrganizationAddressType, name?: string | null, country?: string | null, streetAddress?: string | null, locality?: string | null, region?: string | null, postalCode?: string | null } }> }, leaders: { __typename?: 'OrganizationLeadersConnection', edges: Array<{ __typename?: 'OrganizationLeadersConnectionEdge', node: { __typename?: 'OrganizationLeader', type: Types.OrganizationLeaderType, name?: string | null, email?: string | null, phoneNumber?: string | null } }> } } };
