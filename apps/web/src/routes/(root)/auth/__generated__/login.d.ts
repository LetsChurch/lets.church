import * as Types from '../../../../__generated__/graphql-types';

export type LoginMutationVariables = Types.Exact<{
  id: Types.Scalars['String'];
  password: Types.Scalars['String'];
}>;


export type LoginMutation = { __typename?: 'Mutation', login?: string | null };
