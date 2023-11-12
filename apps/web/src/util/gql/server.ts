import envariant from '@knpwrs/envariant';
import { GraphQLClient, gql } from 'graphql-request';
import { redirect } from 'solid-start';
import server$ from 'solid-start/server';
import { getClientIp } from 'request-ip';
import { getSessionJwt } from '../session';
import {
  AdminClientMeQuery,
  AdminClientMeQueryVariables,
} from './__generated__/server';
import { AppUserRole } from '~/__generated__/graphql-types';

const GRAPHQL_URL = envariant('GRAPHQL_URL', server$.env);

export const client = new GraphQLClient(GRAPHQL_URL, {
  credentials: 'include',
});

function getForwardingHeaders(headers: Headers) {
  const rec: Record<string, string> = {};

  headers.forEach((value, key) => {
    rec[key] = value;
  });

  const ip = getClientIp({ headers: rec });

  return ip ? { 'x-client-ip': ip } : {};
}

export async function createAuthenticatedClientOrRedirect(request: Request) {
  const jwt = await getSessionJwt(request);

  if (!jwt) {
    throw redirect('/');
  }

  return new GraphQLClient(GRAPHQL_URL, {
    headers: {
      authorization: `Bearer ${jwt}`,
      ...getForwardingHeaders(request.headers),
    },
  });
}

export async function createAuthenticatedClient(request: Request) {
  const jwt = await getSessionJwt(request);

  if (jwt) {
    return new GraphQLClient(GRAPHQL_URL, {
      headers: {
        authorization: `Bearer ${jwt}`,
        ...getForwardingHeaders(request.headers),
      },
    });
  }

  return client;
}

export async function createAdminClientOrRedirect(request: Request) {
  const jwt = await getSessionJwt(request);

  if (!jwt) {
    throw redirect('/');
  }

  const client = new GraphQLClient(GRAPHQL_URL, {
    headers: {
      authorization: `Bearer ${jwt}`,
      ...getForwardingHeaders(request.headers),
    },
  });

  const { data } = await client.rawRequest<
    AdminClientMeQuery,
    AdminClientMeQueryVariables
  >(gql`
    query AdminClientMe {
      me {
        role
      }
    }
  `);

  if (data.me?.role !== AppUserRole.Admin) {
    throw redirect('/');
  }

  return client;
}
