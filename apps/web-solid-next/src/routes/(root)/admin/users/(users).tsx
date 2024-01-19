import { gql } from 'graphql-request';
import { type RouteDefinition, cache, createAsync } from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import {
  AdminUsersRouteQuery,
  AdminUsersRouteQueryVariables,
  AdminUsersRouteRowPropsFragment,
} from './__generated__/(users)';
import { PageHeading } from '~/components/page-heading';
import { getAdminClientOrRedirect } from '~/util/gql/server';
import Table from '~/components/admin/table';
import Pagination from '~/components/pagination';

const PAGE_SIZE = 60;

const loadUsers = cache(async () => {
  'use server';
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? '');
  const before = url.searchParams.get('before');
  const after = url.searchParams.get('after');

  const client = await getAdminClientOrRedirect();

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
}, 'adminUsers');

export const route: RouteDefinition = {
  load: () => loadUsers(),
};

export default function AdminUsersRoute() {
  const data = createAsync(loadUsers);

  return (
    <div>
      <PageHeading
        title="Admin: Users"
        actions={[
          { variant: 'primary', label: 'New User', href: '/admin/users/edit' },
        ]}
      />
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
              <a
                href={`/admin/users/edit?id=${d.node.id}`}
                class="text-indigo-600 hover:text-indigo-900"
              >
                Edit <span class="sr-only">{d.node.username}</span>
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
