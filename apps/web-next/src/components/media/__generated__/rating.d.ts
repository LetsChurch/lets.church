import * as Types from '../../../__generated__/graphql-types';

export type MediaRouteRatingStateQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid']['input'];
}>;


export type MediaRouteRatingStateQuery = { __typename?: 'Query', data: { __typename?: 'UploadRecord', totalLikes: number, totalDislikes: number, myRating?: Types.Rating | null } };

export type SubmitUploadRatingMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid']['input'];
  rating: Types.Rating;
}>;


export type SubmitUploadRatingMutation = { __typename?: 'Mutation', rateUpload: boolean };
