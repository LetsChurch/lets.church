import * as Types from '../../../__generated__/graphql-types';

export type HomepageDataQueryVariables = Types.Exact<{
  loggedIn: Types.Scalars['Boolean']['input'];
}>;


export type HomepageDataQuery = { __typename?: 'Query', newsletterListIds: Array<string>, subscriptionUploads?: { __typename?: 'QueryMySubscriptionUploadRecordsConnection', pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, startCursor?: string | null, endCursor?: string | null }, edges: Array<{ __typename?: 'QueryMySubscriptionUploadRecordsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, thumbnailUrl?: string | null, thumbnailLqUrl?: string | null, channel: { __typename?: 'Channel', id: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null, defaultThumbnailLqUrl?: string | null } } }> } | null, trendingUploads: { __typename?: 'QueryUploadRecordsConnection', pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, startCursor?: string | null, endCursor?: string | null }, edges: Array<{ __typename?: 'QueryUploadRecordsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, thumbnailUrl?: string | null, thumbnailLqUrl?: string | null, channel: { __typename?: 'Channel', id: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null, defaultThumbnailLqUrl?: string | null } } }> } };
