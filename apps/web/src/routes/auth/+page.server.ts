import { redirect } from '@sveltejs/kit';
import * as Z from 'zod';
import { getClient, gql } from '../../util/graphql-request';
import type {
  LoginMutation,
  LoginMutationVariables,
  LogoutMutation,
} from '../../__generated__/graphql-types';
import type { Actions } from './$types';

const LoginSchema = Z.object({
  id: Z.string(),
  password: Z.string(),
});

export const actions: Actions = {
  login: async (event) => {
    const { request } = event;
    const data = await request.formData();
    const client = getClient(event);

    const parsed = LoginSchema.parse(Object.fromEntries(data.entries()));
    const res = await client.request<LoginMutation, LoginMutationVariables>(
      gql`
        mutation Login($id: String!, $password: String!) {
          login(id: $id, password: $password) {
            id
          }
        }
      `,
      parsed,
    );

    if (res.login?.id) {
      throw redirect(307, '/');
    }

    throw new Error('Error logging in!');
  },
  logout: async (event) => {
    const client = getClient(event);

    await client.request<LogoutMutation>(
      gql`
        mutation Logout {
          logout
        }
      `,
    );

    throw redirect(307, '/');
  },
};
