import envariant from '@knpwrs/envariant';
import { GraphQLClient } from 'graphql-request';
import { getSessionJwt } from './session';

export { gql } from 'graphql-request';

const GRAPHQL_URL = envariant('GRAPHQL_URL');

export const client = new GraphQLClient(GRAPHQL_URL, {
  credentials: 'include',
});

export async function createAuthenticatedClient(request: Request) {
  const jwt = await getSessionJwt(request);

  if (!jwt) {
    return client;
  }

  return new GraphQLClient(GRAPHQL_URL, {
    headers: { authorization: `Bearer ${jwt}` },
  });
}
