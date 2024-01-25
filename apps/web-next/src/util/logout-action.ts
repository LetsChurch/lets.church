import invariant from 'tiny-invariant';
import { gql } from 'graphql-request';
import { action, redirect } from '@solidjs/router';
import { getAuthenticatedClientOrRedirect } from './gql/server';
import { clearSessionJwt } from './session';

export default action(async (form: FormData) => {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();

  const to = form.get('redirect') ?? '/';
  invariant(typeof to === 'string');

  await client.request(gql`
    mutation Logout {
      logout
    }
  `);

  await clearSessionJwt();

  throw redirect(to);
});
