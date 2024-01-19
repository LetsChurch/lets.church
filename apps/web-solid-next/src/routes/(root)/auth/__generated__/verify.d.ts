import * as Types from '../../../../__generated__/graphql-types';

export type VerifyEmailMutationVariables = Types.Exact<{
  userId: Types.Scalars['ShortUuid']['input'];
  emailId: Types.Scalars['ShortUuid']['input'];
  emailKey: Types.Scalars['ShortUuid']['input'];
}>;


export type VerifyEmailMutation = { __typename?: 'Mutation', verifyEmail: boolean };
