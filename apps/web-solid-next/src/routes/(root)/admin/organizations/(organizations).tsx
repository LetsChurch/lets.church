import { gql } from 'graphql-request';
import { createAsync } from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import {
  AdminOrganizationsRouteQuery,
  AdminOrganizationsRouteQueryVariables,
  AdminOrganizationsRouteRowPropsFragment,
} from './__generated__/(organizations)';
import { PageHeading } from '~/components/page-heading';
import { getAdminClientOrRedirect } from '~/util/gql/server';
import Table from '~/components/admin/table';
import Pagination from '~/components/pagination';

const PAGE_SIZE = 60;

const loadOrganizations = async () => {
  'use server';
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? '');
  const before = url.searchParams.get('before');
  const after = url.searchParams.get('after');

  const client = await getAdminClientOrRedirect();

  const res = await client.request<
    AdminOrganizationsRouteQuery,
    AdminOrganizationsRouteQueryVariables
  >(
    gql`
      fragment AdminOrganizationsRouteRowProps on Organization {
        id
        type
        name
        slug
      }

      query AdminOrganizationsRoute(
        $after: String
        $before: String
        $first: Int
        $last: Int
      ) {
        organizationsConnection(
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
              ...AdminOrganizationsRouteRowProps
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
};

export default function AdminOrganizationsRoute() {
  const data = createAsync(loadOrganizations);

  return (
    <div>
      <PageHeading
        title="Admin: Organizations"
        actions={[
          {
            variant: 'primary',
            label: 'New Organization',
            href: '/admin/organizations/edit',
          },
        ]}
      />
      <Table<{ node: AdminOrganizationsRouteRowPropsFragment }>
        columns={[
          { title: 'Name', render: (d) => d.node.name },
          { title: 'Type', render: (d) => d.node.type },
          { title: 'Slug', render: (d) => d.node.slug },
          {
            title: 'Edit',
            titleSrOnly: true,
            render: (d) => (
              <a
                href={`/admin/organizations/edit?id=${d.node.id}`}
                class="text-indigo-600 hover:text-indigo-900"
              >
                Edit<span class="sr-only">, {d.node.name}</span>
              </a>
            ),
          },
        ]}
        data={data()?.organizationsConnection.edges ?? []}
      />
      <Pagination
        hasPreviousPage={
          data()?.organizationsConnection.pageInfo.hasPreviousPage ?? false
        }
        hasNextPage={
          data()?.organizationsConnection.pageInfo.hasNextPage ?? false
        }
        startCursor={data()?.organizationsConnection.pageInfo.startCursor ?? ''}
        endCursor={data()?.organizationsConnection.pageInfo.endCursor ?? ''}
      />
    </div>
  );
}
