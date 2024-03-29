import * as Types from '../../../__generated__/graphql-types';

export type AboutPageDataQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type AboutPageDataQuery = { __typename?: 'Query', stats: { __typename?: 'Stats', totalUploadSeconds: number, totalUploads: number } };
