import * as Types from '../../__generated__/graphql-types';

export type MediaRowPropsFragment = { __typename?: 'UploadRecord', title?: string | null, publishedAt?: string | null, totalViews: number, thumbnailUrl?: string | null, variants: Array<Types.UploadVariant>, thumbnailLqUrl?: string | null, channel: { __typename?: 'Channel', id: string, slug: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null, defaultThumbnailLqUrl?: string | null } };
