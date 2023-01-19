import * as Types from '../../../../__generated__/graphql-types';

export type MediaRouteRatingStateQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
}>;


export type MediaRouteRatingStateQuery = { __typename?: 'Query', data: { __typename?: 'UploadRecord', totalLikes: number, totalDislikes: number, myRating?: Types.Rating | null } };

export type MediaRouteMetaDataQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
}>;


export type MediaRouteMetaDataQuery = { __typename?: 'Query', data: { __typename?: 'UploadRecord', id: any, title?: string | null, mediaSource?: string | null, audioSource?: string | null, mediaJwt: any, channel: { __typename?: 'Channel', id: any, name: string } } };

export type SubmitUploadRatingMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid'];
  rating: Types.Rating;
}>;


export type SubmitUploadRatingMutation = { __typename?: 'Mutation', rateUpload: boolean };
