'use server';
import envariant from '@knpwrs/envariant';
import { GraphQLClient, gql } from 'graphql-request';
import { redirect } from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import { getSessionJwt } from '../session';
import { getClientIpAddress } from '../request-ip';
import {
  AdminClientMeQuery,
  AdminClientMeQueryVariables,
} from './__generated__/server';
import { AppUserRole } from '~/__generated__/graphql-types';

const GRAPHQL_URL = envariant('GRAPHQL_URL');

function getForwardingHeaders() {
  'use server';
  const headers = getRequestEvent()?.request.headers;
  if (!headers) return {};

  const ip = getClientIpAddress(headers);

  return ip ? { 'x-client-ip': ip } : {};
}

export async function getAuthenticatedClientOrRedirect() {
  const jwt = await getSessionJwt();

  if (!jwt) {
    throw redirect('/');
  }

  return new GraphQLClient(GRAPHQL_URL, {
    headers: {
      authorization: `Bearer ${jwt}`,
      ...getForwardingHeaders(),
    },
    errorPolicy: 'all',
  });
}

export async function getAuthenticatedClient() {
  const jwt = await getSessionJwt();

  return new GraphQLClient(GRAPHQL_URL, {
    headers: {
      ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
      ...getForwardingHeaders(),
    },
    errorPolicy: 'all',
  });
}

export async function getAdminClientOrRedirect() {
  const jwt = await getSessionJwt();

  if (!jwt) {
    throw redirect('/');
  }

  const client = new GraphQLClient(GRAPHQL_URL, {
    headers: {
      authorization: `Bearer ${jwt}`,
      ...getForwardingHeaders(),
    },
    errorPolicy: 'all',
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
