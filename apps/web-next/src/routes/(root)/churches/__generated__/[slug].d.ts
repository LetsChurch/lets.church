import * as Types from '../../../../__generated__/graphql-types';

export type OrganizationBySlugQueryVariables = Types.Exact<{
  slug: Types.Scalars['String']['input'];
}>;


export type OrganizationBySlugQuery = { __typename?: 'Query', church: { __typename?: 'Organization', name: string, type: Types.OrganizationType, description?: string | null, avatarUrl?: string | null, coverUrl?: string | null, primaryPhoneNumber?: string | null, primaryPhoneUri?: string | null, primaryEmail?: string | null, websiteUrl?: string | null, tags: { __typename?: 'OrganizationTagsConnection', edges: Array<{ __typename?: 'OrganizationTagsConnectionEdge', node: { __typename?: 'OrganizationTagInstance', tag: { __typename?: 'OrganizationTag', category: Types.OrganizationTagCategory, color: Types.TagColor, label: string, description?: string | null, slug: string } } }> }, addresses: { __typename?: 'OrganizationAddressesConnection', edges: Array<{ __typename?: 'OrganizationAddressesConnectionEdge', node: { __typename?: 'OrganizationAddress', type: Types.OrganizationAddressType, name?: string | null, streetAddress?: string | null, locality?: string | null, region?: string | null, postalCode?: string | null, postOfficeBoxNumber?: string | null, country?: string | null } }> }, officialChannelsConnection: { __typename?: 'OrganizationOfficialChannelsConnection', edges: Array<{ __typename?: 'OrganizationOfficialChannelsConnectionEdge', node: { __typename?: 'OrganizationChannelAssociation', channel: { __typename?: 'Channel', slug: string, name: string, avatarUrl?: string | null } } }> }, endorsedChannelsConnection: { __typename?: 'OrganizationEndorsedChannelsConnection', edges: Array<{ __typename?: 'OrganizationEndorsedChannelsConnectionEdge', node: { __typename?: 'OrganizationChannelAssociation', channel: { __typename?: 'Channel', slug: string, name: string, avatarUrl?: string | null } } }> } } };

export type ChannelPropsFragment = { __typename?: 'OrganizationChannelAssociation', channel: { __typename?: 'Channel', slug: string, name: string, avatarUrl?: string | null } };
