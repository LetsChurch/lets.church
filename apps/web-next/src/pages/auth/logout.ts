import type { APIRoute } from 'astro';
import invariant from 'tiny-invariant';
import { gql } from 'graphql-request';
import { createClient } from '../../util/server/gql';
import type {
  LogoutMutation,
  LogoutMutationVariables,
} from './__generated__/logout';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const client = await createClient(
    request.headers,
    cookies.get('lcSession')?.value,
  );

  const to = (await request.formData()).get('to') ?? '/';
  invariant(typeof to === 'string', 'Client not created');

  await client.request<LogoutMutation, LogoutMutationVariables>(gql`
    mutation Logout {
      logout
    }
  `);

  cookies.delete('jwt', { path: '/' });

  return redirect(to);
};
