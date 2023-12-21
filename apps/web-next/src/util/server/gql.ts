import envariant from '@knpwrs/envariant';
import { GraphQLClient } from 'graphql-request';
import { getClientIpAddress } from './request-ip';

const GRAPHQL_URL = envariant('GRAPHQL_URL');

export async function createClient(requestHeaders: Headers, jwt?: string) {
  const forwardingHeaders = new Headers();

  if (jwt) {
    forwardingHeaders.set('authorization', `Bearer ${jwt}`);
  }

  const ip = getClientIpAddress(requestHeaders);

  if (ip) {
    forwardingHeaders.set('x-client-ip', ip);
  }

  return new GraphQLClient(GRAPHQL_URL, {
    headers: forwardingHeaders,
  });
}
