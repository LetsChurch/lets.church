import envariant from '@knpwrs/envariant';
import { GraphQLClient } from 'graphql-request';
import { redirect } from 'solid-start';
import server$ from 'solid-start/server';
import { getSessionJwt } from '../session';

export { gql } from 'graphql-request';

const GRAPHQL_URL = envariant('GRAPHQL_URL', server$.env);

export const client = new GraphQLClient(GRAPHQL_URL, {
  credentials: 'include',
});

export async function createAuthenticatedClientOrRedirect(request: Request) {
  const jwt = await getSessionJwt(request);

  if (!jwt) {
    throw redirect('/');
  }

  return new GraphQLClient(GRAPHQL_URL, {
    headers: { authorization: `Bearer ${jwt}` },
  });
}

export async function createAuthenticatedClient(request: Request) {
  const jwt = await getSessionJwt(request);

  if (jwt) {
    return new GraphQLClient(GRAPHQL_URL, {
      headers: { authorization: `Bearer ${jwt}` },
    });
  }

  return client;
}
