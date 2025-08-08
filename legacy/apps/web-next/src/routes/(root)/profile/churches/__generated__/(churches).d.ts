import * as Types from '../../../../../__generated__/graphql-types';

export type MyChurchesQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type MyChurchesQuery = { __typename?: 'Query', me?: { __typename?: 'AppUser', churches: { __typename?: 'AppUserOrganizationMemberhipsConnection', edges: Array<{ __typename?: 'AppUserOrganizationMemberhipsConnectionEdge', node: { __typename?: 'OrganizationMembership', isAdmin: boolean, organization: { __typename?: 'Organization', id: string, slug: string, name: string } } }> } } | null };
