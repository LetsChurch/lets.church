import * as Types from '../../../../__generated__/graphql-types';

export type MediaRouteRecordViewMutationVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid']['input'];
}>;


export type MediaRouteRecordViewMutation = { __typename?: 'Mutation', recordUploadView: boolean };

export type CommentFieldsFragment = { __typename?: 'UploadUserComment', id: string, uploadRecordId: string, createdAt: string, updatedAt: string, text: string, totalLikes: number, totalDislikes: number, myRating?: Types.Rating | null, author: { __typename?: 'AppUser', username: string, avatarUrl?: string | null } };

export type MediaRouteMetaDataQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid']['input'];
  seriesId?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  commentsFirst?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  commentsAfter?: Types.InputMaybe<Types.Scalars['String']['input']>;
  commentsLast?: Types.InputMaybe<Types.Scalars['Int']['input']>;
  commentsBefore?: Types.InputMaybe<Types.Scalars['String']['input']>;
}>;


export type MediaRouteMetaDataQuery = { __typename?: 'Query', data: { __typename?: 'UploadRecord', id: string, title?: string | null, lengthSeconds?: number | null, description?: string | null, publishedAt?: string | null, totalViews: number, mediaSource?: string | null, audioSource?: string | null, thumbnailUrl?: string | null, peaksDatUrl?: string | null, peaksJsonUrl?: string | null, downloadsEnabled: boolean, userCommentsEnabled: boolean, channel: { __typename?: 'Channel', id: string, slug: string, name: string, avatarUrl?: string | null, defaultThumbnailUrl?: string | null, userIsSubscribed: boolean }, downloadUrls?: Array<{ __typename?: 'MediaDownload', kind: Types.MediaDownloadKind, label: string, url: string }> | null, series?: { __typename?: 'UploadList', id: string, title: string, uploads: { __typename?: 'UploadListUploadsConnection', edges: Array<{ __typename?: 'UploadListUploadsConnectionEdge', node: { __typename?: 'UploadListEntry', upload: { __typename?: 'UploadRecord', id: string, title?: string | null } } }> } } | null, transcript?: Array<{ __typename?: 'TranscriptLine', start: number, text: string }> | null, userComments: { __typename?: 'UploadRecordUserCommentsConnection', totalCount: number, pageInfo: { __typename?: 'PageInfo', endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null }, edges: Array<{ __typename?: 'UploadRecordUserCommentsConnectionEdge', node: { __typename?: 'UploadUserComment', id: string, uploadRecordId: string, createdAt: string, updatedAt: string, text: string, totalLikes: number, totalDislikes: number, myRating?: Types.Rating | null, replies: { __typename?: 'UploadUserCommentRepliesConnection', totalCount: number, edges: Array<{ __typename?: 'UploadUserCommentRepliesConnectionEdge', node: { __typename?: 'UploadUserComment', id: string, uploadRecordId: string, createdAt: string, updatedAt: string, text: string, totalLikes: number, totalDislikes: number, myRating?: Types.Rating | null, author: { __typename?: 'AppUser', username: string, avatarUrl?: string | null } } }> }, author: { __typename?: 'AppUser', username: string, avatarUrl?: string | null } } }> } } };

export type ModifySubscriptionMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ShortUuid']['input'];
  subscribe: Types.Scalars['Boolean']['input'];
}>;


export type ModifySubscriptionMutation = { __typename?: 'Mutation', unsubscribeFromChannel?: boolean, subscribeToChannel?: { __typename?: 'ChannelSubscription', channel: { __typename?: 'Channel', id: string, userIsSubscribed: boolean } } };

export type SubmitUploadCommentRatingMutationVariables = Types.Exact<{
  uploadUserCommentId: Types.Scalars['ShortUuid']['input'];
  rating: Types.Rating;
}>;


export type SubmitUploadCommentRatingMutation = { __typename?: 'Mutation', rateComment: boolean };

export type UpsertCommentMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid']['input'];
  replyingTo?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
  text: Types.Scalars['String']['input'];
  commentId?: Types.InputMaybe<Types.Scalars['ShortUuid']['input']>;
}>;


export type UpsertCommentMutation = { __typename?: 'Mutation', upsertUploadUserComment: { __typename?: 'UploadUserComment', id: string } };
