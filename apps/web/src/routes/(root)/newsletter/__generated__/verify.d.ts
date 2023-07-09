import * as Types from '../../../../__generated__/graphql-types';

export type VerifyNewsletterSubscriptionMutationVariables = Types.Exact<{
  subscriptionId: Types.Scalars['ShortUuid'];
  emailKey: Types.Scalars['ShortUuid'];
}>;


export type VerifyNewsletterSubscriptionMutation = { __typename?: 'Mutation', verifyNewsletterSubscription: boolean };
