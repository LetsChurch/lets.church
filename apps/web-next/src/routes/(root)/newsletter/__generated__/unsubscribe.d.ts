import * as Types from '../../../../__generated__/graphql-types';

export type UnsubscribeFromNewsletterMutationVariables = Types.Exact<{
  subscriptionId: Types.Scalars['ShortUuid']['input'];
  emailKey: Types.Scalars['ShortUuid']['input'];
}>;


export type UnsubscribeFromNewsletterMutation = { __typename?: 'Mutation', unsubscribeFromNewsletter: boolean };
