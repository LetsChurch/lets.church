import * as Types from '../../../../__generated__/graphql-types';

export type EmbedMediaRouteMetaDataQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid']['input'];
}>;


export type EmbedMediaRouteMetaDataQuery = { __typename?: 'Query', data: { __typename?: 'UploadRecord', id: string, title?: string | null, lengthSeconds?: number | null, publishedAt?: string | null, mediaSource?: string | null, audioSource?: string | null, thumbnailUrl?: string | null, peaksDatUrl?: string | null, peaksJsonUrl?: string | null, channel: { __typename?: 'Channel', id: string, slug: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null, userIsSubscribed: boolean } } };
