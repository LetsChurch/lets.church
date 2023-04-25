import * as Types from '../../../../__generated__/graphql-types';

export type VerifyEmailMutationVariables = Types.Exact<{
  userId: Types.Scalars['ShortUuid'];
  emailId: Types.Scalars['ShortUuid'];
  emailKey: Types.Scalars['ShortUuid'];
}>;


export type VerifyEmailMutation = { __typename?: 'Mutation', verifyEmail: boolean };
