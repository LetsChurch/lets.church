import * as Types from '../../../../__generated__/graphql-types';

export type RegisterMutationVariables = Types.Exact<{
  email: Types.Scalars['String'];
  username: Types.Scalars['String'];
  password: Types.Scalars['String'];
  fullName?: Types.InputMaybe<Types.Scalars['String']>;
  agreeToTerms: Types.Scalars['Boolean'];
  agreeToTheology: Types.Scalars['Boolean'];
}>;


export type RegisterMutation = { __typename?: 'Mutation', register: { __typename: 'DataError', error: { __typename?: 'PrismaRuntimeError', message: string } } | { __typename: 'MutationRegisterSuccess', data: { __typename?: 'AppUser', id: string } } | { __typename: 'ValidationError', fieldErrors: Array<{ __typename?: 'ZodFieldError', path: Array<string>, message: string }> } };

export type LoginAfterRegisterMutationVariables = Types.Exact<{
  id: Types.Scalars['String'];
  password: Types.Scalars['String'];
}>;


export type LoginAfterRegisterMutation = { __typename?: 'Mutation', login?: string | null };
