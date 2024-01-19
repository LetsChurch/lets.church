import * as Types from '../../../../__generated__/graphql-types';

export type ResetPasswordMutationVariables = Types.Exact<{
  id: Types.Scalars['Uuid']['input'];
  password: Types.Scalars['String']['input'];
}>;


export type ResetPasswordMutation = { __typename?: 'Mutation', resetPassword: boolean };
