import * as Types from '../../../../__generated__/graphql-types';

export type VerifyNewsletterSubscriptionMutationVariables = Types.Exact<{
  subscriptionId: Types.Scalars['ShortUuid']['input'];
  emailKey: Types.Scalars['ShortUuid']['input'];
}>;


export type VerifyNewsletterSubscriptionMutation = { __typename?: 'Mutation', verifyNewsletterSubscription: boolean };
