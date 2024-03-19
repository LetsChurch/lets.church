import * as Types from '../../../../../__generated__/graphql-types';

export type ChannelLatestPodcastFeedQueryVariables = Types.Exact<{
  slug: Types.Scalars['String']['input'];
}>;


export type ChannelLatestPodcastFeedQuery = { __typename?: 'Query', channelBySlug: { __typename?: 'Channel', name: string, defaultThumbnailUrl?: string | null, uploadsConnection: { __typename?: 'ChannelUploadsConnection', edges: Array<{ __typename?: 'ChannelUploadsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, description?: string | null, thumbnailUrl?: string | null, podcastSource: string, podcastSizeBytes: number, publishedAt?: string | null } }> } } };
