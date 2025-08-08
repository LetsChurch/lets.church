import * as Types from '../../../../__generated__/graphql-types';

export type LoginMutationVariables = Types.Exact<{
  id: Types.Scalars['String']['input'];
  password: Types.Scalars['String']['input'];
}>;


export type LoginMutation = { __typename?: 'Mutation', login?: string | null };
