import * as Types from '../../../__generated__/graphql-types';

export type MediaRouteRecordViewRangesMutationVariables = Types.Exact<{
  id: Types.Scalars['ShortUuid']['input'];
  ranges: Array<Types.TimeRange> | Types.TimeRange;
  viewId?: Types.InputMaybe<Types.Scalars['Uuid']['input']>;
}>;


export type MediaRouteRecordViewRangesMutation = { __typename?: 'Mutation', viewId: string };
