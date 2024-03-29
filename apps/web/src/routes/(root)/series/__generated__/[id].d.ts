import * as Types from '../../../../__generated__/graphql-types';

export type SeriesRouteDataQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid']['input'];
}>;


export type SeriesRouteDataQuery = { __typename?: 'Query', uploadListById: { __typename?: 'UploadList', id: string, title: string, uploads: { __typename?: 'UploadListUploadsConnection', edges: Array<{ __typename?: 'UploadListUploadsConnectionEdge', node: { __typename?: 'UploadListEntry', upload: { __typename?: 'UploadRecord', id: string, title?: string | null, publishedAt?: string | null, totalViews: number, thumbnailUrl?: string | null, variants: Array<Types.UploadVariant>, thumbnailLqUrl?: string | null, channel: { __typename?: 'Channel', id: string, slug: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null, defaultThumbnailLqUrl?: string | null } } } }> } } };
