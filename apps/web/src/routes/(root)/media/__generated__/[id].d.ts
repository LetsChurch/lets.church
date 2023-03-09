import * as Types from '../../../../__generated__/graphql-types';

export type MediaRouteRatingStateQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
}>;


export type MediaRouteRatingStateQuery = { __typename?: 'Query', data: { __typename?: 'UploadRecord', totalLikes: number, totalDislikes: number, myRating?: Types.Rating | null } };

export type MediaRouteMetaDataQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
}>;


export type MediaRouteMetaDataQuery = { __typename?: 'Query', data: { __typename?: 'UploadRecord', id: string, title?: string | null, description?: string | null, publishedAt?: string | null, mediaSource?: string | null, audioSource?: string | null, channel: { __typename?: 'Channel', id: string, name: string }, transcript?: Array<{ __typename?: 'TranscriptLine', start: number, text: string }> | null } };

export type SubmitUploadRatingMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid'];
  rating: Types.Rating;
}>;


export type SubmitUploadRatingMutation = { __typename?: 'Mutation', rateUpload: boolean };
