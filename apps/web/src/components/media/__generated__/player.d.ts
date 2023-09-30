import * as Types from '../../../__generated__/graphql-types';

export type MediaRouteRecordUploadSegmentViewMutationVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid']['input'];
  start: Types.Scalars['Float']['input'];
  end: Types.Scalars['Float']['input'];
}>;


export type MediaRouteRecordUploadSegmentViewMutation = { __typename?: 'Mutation', recordUploadSegmentView: boolean };
