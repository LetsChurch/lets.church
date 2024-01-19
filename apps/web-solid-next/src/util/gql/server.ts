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

function getForwardingHeaders(headers?: Headers) {
  if (!headers) return {};

  const ip = getClientIpAddress(headers);

  return ip ? { 'x-client-ip': ip } : {};
}

export async function getAuthenticatedClientOrRedirect() {
  const event = getRequestEvent();
  const jwt = await getSessionJwt(event);

  if (!jwt) {
    throw redirect('/');
  }

  return new GraphQLClient(GRAPHQL_URL, {
    headers: {
      authorization: `Bearer ${jwt}`,
      ...getForwardingHeaders(event?.request.headers),
    },
  });
}

export async function getAuthenticatedClient() {
  const event = getRequestEvent();
  const jwt = await getSessionJwt(event);

  return new GraphQLClient(GRAPHQL_URL, {
    headers: {
      ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
      ...getForwardingHeaders(event?.request.headers),
    },
  });
}

export async function getAdminClientOrRedirect() {
  const event = getRequestEvent();
  const jwt = await getSessionJwt(event);

  if (!jwt) {
    throw redirect('/');
  }

  const client = new GraphQLClient(GRAPHQL_URL, {
    headers: {
      authorization: `Bearer ${jwt}`,
      ...getForwardingHeaders(event?.request.headers),
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
