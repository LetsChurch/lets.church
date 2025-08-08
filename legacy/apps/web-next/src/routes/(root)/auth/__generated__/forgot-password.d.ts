import * as Types from '../../../../__generated__/graphql-types';

export type ForgotPasswordMutationVariables = Types.Exact<{
  email: Types.Scalars['String']['input'];
}>;


export type ForgotPasswordMutation = { __typename?: 'Mutation', forgotPassword: boolean };
