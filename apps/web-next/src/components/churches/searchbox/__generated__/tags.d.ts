import * as Types from '../../../../__generated__/graphql-types';

export type OrganizationTagsQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type OrganizationTagsQuery = { __typename?: 'Query', organizationTagsConnection: { __typename?: 'QueryOrganizationTagsConnection', edges: Array<{ __typename?: 'QueryOrganizationTagsConnectionEdge', node: { __typename?: 'OrganizationTag', category: Types.OrganizationTagCategory, slug: string, label: string, color: Types.TagColor } }> } };
