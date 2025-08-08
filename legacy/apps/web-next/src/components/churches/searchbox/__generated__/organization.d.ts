import * as Types from '../../../../__generated__/graphql-types';

export type MinistriesQueryQueryVariables = Types.Exact<{
  query: Types.Scalars['String']['input'];
}>;


export type MinistriesQueryQuery = { __typename?: 'Query', search: { __typename?: 'SearchConnection', edges: Array<{ __typename?: 'SearchConnectionEdge', organization: { __typename?: 'ChannelSearchHit' } | { __typename?: 'OrganizationSearchHit', id: string, name: string } | { __typename?: 'TranscriptSearchHit' } | { __typename?: 'UploadSearchHit' } }> } };

export type OrganizationByIdQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid']['input'];
}>;


export type OrganizationByIdQuery = { __typename?: 'Query', organizationById: { __typename?: 'Organization', name: string } };
