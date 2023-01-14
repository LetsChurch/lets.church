import * as Types from '../../../../__generated__/graphql-types';

export type MediaRouteDataQueryVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid'];
}>;


export type MediaRouteDataQuery = { __typename?: 'Query', uploadRecord: { __typename?: 'UploadRecord', id: any, title?: string | null, totalLikes: number, totalDislikes: number, myRating?: Types.Rating | null, channel: { __typename?: 'Channel', id: any, name: string } } };

export type SubmitUploadRatingMutationVariables = Types.Exact<{
  uploadRecordId: Types.Scalars['ShortUuid'];
  rating: Types.Rating;
}>;


export type SubmitUploadRatingMutation = { __typename?: 'Mutation', rateUpload: boolean };
