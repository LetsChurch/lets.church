import * as Types from '../../../__generated__/graphql-types';

export type UploadCardFieldsFragment = { __typename?: 'UploadRecord', id: string, title?: string | null, lengthSeconds?: number | null, publishedAt?: string | null, thumbnailUrl?: string | null, hasVideo: boolean, hasAudio: boolean, thumbnailLqUrl?: string | null, channel: { __typename?: 'Channel', id: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null, defaultThumbnailLqUrl?: string | null } };
