import * as Types from '../../__generated__/graphql-types';

export type AboutPageStatsQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type AboutPageStatsQuery = { __typename?: 'Query', stats: { __typename?: 'Stats', totalUploadSeconds: number, totalUploads: number } };
