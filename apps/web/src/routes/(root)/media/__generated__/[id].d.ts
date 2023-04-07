import * as Types from '../../../../__generated__/graphql-types';

export type MediaRouteRatingStateQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
}>;


export type MediaRouteRatingStateQuery = { __typename?: 'Query', data: { __typename?: 'UploadRecord', totalLikes: number, totalDislikes: number, myRating?: Types.Rating | null } };

export type CommentFieldsFragment = { __typename?: 'UploadUserComment', id: string, uploadRecordId: string, createdAt: string, updatedAt: string, text: string, totalLikes: number, totalDislikes: number, myRating?: Types.Rating | null, author: { __typename?: 'AppUser', username: string, avatarUrl?: string | null } };

export type MediaRouteMetaDataQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
}>;


export type MediaRouteMetaDataQuery = { __typename?: 'Query', data: { __typename?: 'UploadRecord', id: string, title?: string | null, description?: string | null, publishedAt?: string | null, mediaSource?: string | null, audioSource?: string | null, channel: { __typename?: 'Channel', id: string, name: string, userIsSubscribed: boolean }, transcript?: Array<{ __typename?: 'TranscriptLine', start: number, text: string }> | null, userComments: { __typename?: 'UploadRecordUserCommentsConnection', totalCount: number, edges: Array<{ __typename?: 'UploadRecordUserCommentsConnectionEdge', node: { __typename?: 'UploadUserComment', id: string, uploadRecordId: string, createdAt: string, updatedAt: string, text: string, totalLikes: number, totalDislikes: number, myRating?: Types.Rating | null, replies: { __typename?: 'UploadUserCommentRepliesConnection', totalCount: number, edges: Array<{ __typename?: 'UploadUserCommentRepliesConnectionEdge', node: { __typename?: 'UploadUserComment', id: string, uploadRecordId: string, createdAt: string, updatedAt: string, text: string, totalLikes: number, totalDislikes: number, myRating?: Types.Rating | null, author: { __typename?: 'AppUser', username: string, avatarUrl?: string | null } } }> }, author: { __typename?: 'AppUser', username: string, avatarUrl?: string | null } } }> } } };

export type ModifySubscriptionMutationVariables = Types.Exact<{
  channelId: Types.Scalars['ShortUuid'];
  subscribe: Types.Scalars['Boolean'];
}>;


export type ModifySubscriptionMutation = { __typename?: 'Mutation', unsubscribeFromChannel?: boolean, subscribeToChannel?: { __typename?: 'ChannelSubscription', channel: { __typename?: 'Channel', id: string, userIsSubscribed: boolean } } };

export type SubmitUploadRatingMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid'];
  rating: Types.Rating;
}>;


export type SubmitUploadRatingMutation = { __typename?: 'Mutation', rateUpload: boolean };

export type SubmitUploadCommentRatingMutationVariables = Types.Exact<{
  uploadUserCommentId: Types.Scalars['ShortUuid'];
  rating: Types.Rating;
}>;


export type SubmitUploadCommentRatingMutation = { __typename?: 'Mutation', rateComment: boolean };

export type UpsertCommentMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid'];
  replyingTo?: Types.InputMaybe<Types.Scalars['ShortUuid']>;
  text: Types.Scalars['String'];
  commentId?: Types.InputMaybe<Types.Scalars['ShortUuid']>;
}>;


export type UpsertCommentMutation = { __typename?: 'Mutation', upsertUploadUserComment: { __typename?: 'UploadUserComment', id: string } };
