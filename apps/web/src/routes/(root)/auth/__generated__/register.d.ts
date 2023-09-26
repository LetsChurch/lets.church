import * as Types from '../../../../__generated__/graphql-types';

export type RegisterMutationVariables = Types.Exact<{
  email: Types.Scalars['String']['input'];
  username: Types.Scalars['String']['input'];
  password: Types.Scalars['String']['input'];
  fullName?: Types.InputMaybe<Types.Scalars['String']['input']>;
  agreeToTerms: Types.Scalars['Boolean']['input'];
  agreeToTheology: Types.Scalars['Boolean']['input'];
  subscribeToNewsletter?: Types.InputMaybe<Types.Scalars['Boolean']['input']>;
}>;


export type RegisterMutation = { __typename?: 'Mutation', register: { __typename: 'DataError', error: { __typename?: 'PrismaRuntimeError', message: string } } | { __typename: 'MutationRegisterSuccess', data: { __typename?: 'AppUser', id: string } } | { __typename: 'ValidationError', fieldErrors: Array<{ __typename?: 'ZodFieldError', path: Array<string>, message: string }> } };

export type LoginAfterRegisterMutationVariables = Types.Exact<{
  id: Types.Scalars['String']['input'];
  password: Types.Scalars['String']['input'];
}>;


export type LoginAfterRegisterMutation = { __typename?: 'Mutation', login?: string | null };
