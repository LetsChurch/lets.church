import { gql } from 'graphql-request';
import { useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import {
  AdminRootRouteQuery,
  AdminRootRouteQueryVariables,
} from './__generated__/(admin)';
import { createAdminClientOrRedirect } from '~/util/gql/server';
import { PageHeading } from '~/components/page-heading';

export function routeData() {
  const metaData = createServerData$(async (_key, { request }) => {
    const client = await createAdminClientOrRedirect(request);

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
  });

  return metaData;
}

export default function AdminRoute() {
  const metaData = useRouteData<typeof routeData>();

  return (
    <div>
      <PageHeading title="Admin" />
      <p>Hello, {metaData()?.me?.username}!</p>
    </div>
  );
}
