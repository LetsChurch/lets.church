import * as Types from '../../../__generated__/graphql-types';

export type SubscriptionsDataQueryVariables = Types.Exact<{
  first?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
  last?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  before?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type SubscriptionsDataQuery = { __typename?: 'Query', mySubscriptionUploadRecords?: { __typename?: 'QueryMySubscriptionUploadRecordsConnection', pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null, endCursor?: string | null }, edges: Array<{ __typename?: 'QueryMySubscriptionUploadRecordsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, thumbnailUrl?: string | null, thumbnailLqUrl?: string | null, channel: { __typename?: 'Channel', id: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null, defaultThumbnailLqUrl?: string | null } } }> } | null };
