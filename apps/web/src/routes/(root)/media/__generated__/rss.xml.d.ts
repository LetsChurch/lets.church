import * as Types from '../../../../__generated__/graphql-types';

export type LatestRssFeedQueryVariables = Types.Exact<{ [key: string]: never; }>;


export type LatestRssFeedQuery = { __typename?: 'Query', uploadRecords: { __typename?: 'QueryUploadRecordsConnection', edges: Array<{ __typename?: 'QueryUploadRecordsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, description?: string | null, thumbnailUrl?: string | null, publishedAt?: string | null, channel: { __typename?: 'Channel', name: string, defaultThumbnailUrl?: string | null, slug: string } } }> } };
