import * as Types from '../../../../__generated__/graphql-types';

export type UnsubscribeFromNewsletterMutationVariables = Types.Exact<{
  subscriptionId: Types.Scalars['ShortUuid'];
  emailKey: Types.Scalars['ShortUuid'];
}>;


export type UnsubscribeFromNewsletterMutation = { __typename?: 'Mutation', unsubscribeFromNewsletter: boolean };
