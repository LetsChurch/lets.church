import * as Types from '../../../__generated__/graphql-types';

export type UploadCardFieldsFragment = { __typename?: 'UploadRecord', id: string, title?: string | null, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, channel: { __typename?: 'Channel', id: string, name: string } };

export type HomepageDataQueryVariables = Types.Exact<{
  loggedIn: Types.Scalars['Boolean'];
}>;


export type HomepageDataQuery = { __typename?: 'Query', subscriptionUploads?: { __typename?: 'QueryMySubscriptionUploadRecordsConnection', pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, startCursor?: string | null, endCursor?: string | null }, edges: Array<{ __typename?: 'QueryMySubscriptionUploadRecordsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, channel: { __typename?: 'Channel', id: string, name: string } } }> } | null, hotUploads: { __typename?: 'QueryUploadRecordsConnection', pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, startCursor?: string | null, endCursor?: string | null }, edges: Array<{ __typename?: 'QueryUploadRecordsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, thumbnailBlurhash?: string | null, thumbnailUrl?: string | null, channel: { __typename?: 'Channel', id: string, name: string } } }> } };
