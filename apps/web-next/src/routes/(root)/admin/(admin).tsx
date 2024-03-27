import { gql } from 'graphql-request';
import { cache, createAsync } from '@solidjs/router';
import {
  AdminRootRouteQuery,
  AdminRootRouteQueryVariables,
} from './__generated__/(admin)';
import { getAdminClientOrRedirect } from '~/util/gql/server';
import { PageHeading } from '~/components/page-heading';

const loadMetaData = cache(async () => {
  'use server';
  const client = await getAdminClientOrRedirect();

  const res = await client.request<
    AdminRootRouteQuery,
    AdminRootRouteQueryVariables
  >(gql`
    query AdminRootRoute {
      me {
        username
      }
    }
  `);

  return res;
}, 'adminRoot');

export default function AdminRoute() {
  const metaData = createAsync(() => loadMetaData());

  return (
    <div>
      <PageHeading title="Admin" />
      <p>Hello, {metaData()?.me?.username}!</p>
    </div>
  );
}
