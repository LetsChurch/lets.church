import { gql } from 'graphql-request';
export type {
  LoginMutation,
  LoginMutationVariables,
  MeQuery,
  MeQueryVariables,
} from './__generated__/auth';

export const loginMutation = gql`
  mutation Login($id: String!, $password: String!) {
    login(id: $id, password: $password)
  }
`;

export const meQuery = gql`
  query Me {
    me {
      id
      role
      avatarUrl(resize: { width: 96, height: 96 })
      canUpload
      username
      fullName
      subscribedToNewsletter
      emails {
        email
      }
    }
  }
`;
