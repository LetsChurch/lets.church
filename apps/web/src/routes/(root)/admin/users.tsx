import { gql } from 'graphql-request';
import { createServerData$ } from 'solid-start/server';
import { RouteDataArgs, useRouteData } from 'solid-start';
import {
  AdminUsersRouteQuery,
  AdminUsersRouteQueryVariables,
  AdminUsersRouteRowPropsFragment,
} from './__generated__/users';
import { PageHeading } from '~/components/page-heading';
import { createAdminClientOrRedirect } from '~/util/gql/server';
import Table from '~/components/table';
import Pagination from '~/components/pagination';

const PAGE_SIZE = 60;

export function routeData({ location }: RouteDataArgs) {
  const metaData = createServerData$(
    async ([, after = null, before = null], { request }) => {
      const client = await createAdminClientOrRedirect(request);

      const res = await client.request<
        AdminUsersRouteQuery,
        AdminUsersRouteQueryVariables
      >(
        gql`
          fragment AdminUsersRouteRowProps on AppUser {
            id
            username
            role
            fullName
            emails {
              email
            }
          }

          query AdminUsersRoute(
            $after: String
            $before: String
            $first: Int
            $last: Int
          ) {
            usersConnection(
              after: $after
              before: $before
              first: $first
              last: $last
            ) {
              pageInfo {
                hasNextPage
                hasPreviousPage
                startCursor
                endCursor
              }
              edges {
                node {
                  ...AdminUsersRouteRowProps
                }
              }
            }
          }
        `,
        {
          after,
          before,
          first: after || !before ? PAGE_SIZE : null,
          last: before ? PAGE_SIZE : null,
        },
      );

      return res;
    },
    {
      key: () => [
        'adminUsers',
        location.query['after'],
        location.query['before'],
      ],
    },
  );

  return metaData;
}

export default function AdminUsersRoute() {
  const data = useRouteData<typeof routeData>();

  return (
    <div>
      <PageHeading title="Admin: Users" />
      <Table<{ node: AdminUsersRouteRowPropsFragment }>
        columns={[
          { title: 'Username', render: (d) => d.node.username },
          { title: 'Role', render: (d) => d.node.role },
          { title: 'Full Name', render: (d) => d.node.fullName },
          { title: 'Email', render: (d) => d.node.emails[0]?.email },
          {
            title: 'Edit',
            titleSrOnly: true,
            render: (d) => (
              <a href="#" class="text-indigo-600 hover:text-indigo-900">
                Edit<span class="sr-only">, {d.node.username}</span>
              </a>
            ),
          },
        ]}
        data={data()?.usersConnection.edges ?? []}
      />
      <Pagination
        hasPreviousPage={
          data()?.usersConnection.pageInfo.hasPreviousPage ?? false
        }
        hasNextPage={data()?.usersConnection.pageInfo.hasNextPage ?? false}
        startCursor={data()?.usersConnection.pageInfo.startCursor ?? ''}
        endCursor={data()?.usersConnection.pageInfo.endCursor ?? ''}
      />
    </div>
  );
}
