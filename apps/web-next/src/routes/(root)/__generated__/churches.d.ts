import * as Types from '../../../__generated__/graphql-types';

export type ChurchesDataQueryVariables = Types.Exact<{
  lon: Types.Scalars['Float']['input'];
  lat: Types.Scalars['Float']['input'];
  range: Types.Scalars['String']['input'];
  organization?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  tags?: Types.InputMaybe<Array<Types.Scalars['String']['input']> | Types.Scalars['String']['input']>;
}>;


export type ChurchesDataQuery = { __typename?: 'Query', search: { __typename?: 'SearchConnection', edges: Array<{ __typename?: 'SearchConnectionEdge', node: { __typename: 'ChannelSearchHit', id: string } | { __typename: 'OrganizationSearchHit', name: string, id: string, organization: { __typename?: 'Organization', id: string, slug: string, type: Types.OrganizationType, addresses: { __typename?: 'OrganizationAddressesConnection', edges: Array<{ __typename?: 'OrganizationAddressesConnectionEdge', node: { __typename?: 'OrganizationAddress', country?: string | null, locality?: string | null, region?: string | null, streetAddress?: string | null, postOfficeBoxNumber?: string | null, postalCode?: string | null, latitude?: number | null, longitude?: number | null } }> } } } | { __typename: 'TranscriptSearchHit', id: string } | { __typename: 'UploadSearchHit', id: string } }> } };
