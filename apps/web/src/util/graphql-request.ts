import envariant from '@knpwrs/envariant';
import type { ServerLoadEvent } from '@sveltejs/kit';
import { GraphQLClient } from 'graphql-request';

export { gql } from 'graphql-request';

const GRAPHQL_URL = envariant('GRAPHQL_URL');

export function getClient({ fetch }: Pick<ServerLoadEvent, 'fetch'>) {
  return new GraphQLClient(GRAPHQL_URL, {
    fetch,
  });
}
