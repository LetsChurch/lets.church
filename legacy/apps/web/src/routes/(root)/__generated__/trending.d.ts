import * as Types from '../../../__generated__/graphql-types';

export type TrendingRouteDataQueryVariables = Types.Exact<{
  first?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  after?: Types.InputMaybe<Types.Scalars['String']['input']>;
  last?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  before?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type TrendingRouteDataQuery = { __typename?: 'Query', uploadRecords: { __typename?: 'QueryUploadRecordsConnection', pageInfo: { __typename?: 'PageInfo', hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null, endCursor?: string | null }, edges: Array<{ __typename?: 'QueryUploadRecordsConnectionEdge', cursor: string, node: { __typename?: 'UploadRecord', id: string, title?: string | null, thumbnailUrl?: string | null, thumbnailLqUrl?: string | null, channel: { __typename?: 'Channel', id: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null, defaultThumbnailLqUrl?: string | null } } }> } };
