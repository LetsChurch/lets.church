import { redirect } from 'solid-start/server';
import { createAuthenticatedClient, gql } from './gql';
import { storage } from './session';

const action = async (_form: FormData, { request }: { request: Request }) => {
  const client = await createAuthenticatedClient(request);
  await client.request(
    gql`
      mutation Logout {
        logout
      }
    `,
  );

  const session = await storage.getSession(request.headers.get('Cookie'));

  return redirect('/', {
    headers: { 'Set-Cookie': await storage.destroySession(session) },
  });
};

export default action;
