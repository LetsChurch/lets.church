import * as Types from '../../__generated__/graphql-types';

export type SubscribeToNewsletterMutationVariables = Types.Exact<{
  email: Types.Scalars['String']['input'];
}>;


export type SubscribeToNewsletterMutation = { __typename?: 'Mutation', subscribeToNewsletter: { __typename: 'MutationSubscribeToNewsletterSuccess', data: boolean } | { __typename: 'ValidationError', fieldErrors: Array<{ __typename?: 'ZodFieldError', message: string, path: Array<string> }> } };
