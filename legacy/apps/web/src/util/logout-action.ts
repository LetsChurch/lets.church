import { redirect } from 'solid-start/server';
import invariant from 'tiny-invariant';
import { gql } from 'graphql-request';
import { createAuthenticatedClientOrRedirect } from './gql/server';
import { storage } from './session';

const action = async (form: FormData, { request }: { request: Request }) => {
  const client = await createAuthenticatedClientOrRedirect(request);

  const to = form.get('redirect') ?? '/';
  invariant(typeof to === 'string');

  await client.request(gql`
    mutation Logout {
      logout
    }
  `);

  const session = await storage.getSession(request.headers.get('Cookie'));

  return redirect(to, {
    headers: { 'Set-Cookie': await storage.destroySession(session) },
  });
};

export default action;
