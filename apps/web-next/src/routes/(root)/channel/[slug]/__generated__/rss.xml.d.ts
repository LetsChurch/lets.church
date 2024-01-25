import * as Types from '../../../../../__generated__/graphql-types';

export type ChannelLatestRssFeedQueryVariables = Types.Exact<{
  slug: Types.Scalars['String']['input'];
}>;


export type ChannelLatestRssFeedQuery = { __typename?: 'Query', channelBySlug: { __typename?: 'Channel', name: string, defaultThumbnailUrl?: string | null, uploadsConnection: { __typename?: 'ChannelUploadsConnection', edges: Array<{ __typename?: 'ChannelUploadsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, description?: string | null, thumbnailUrl?: string | null, publishedAt?: string | null } }> } } };
