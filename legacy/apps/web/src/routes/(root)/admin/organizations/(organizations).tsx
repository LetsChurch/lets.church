import { gql } from 'graphql-request';
import { createServerData$ } from 'solid-start/server';
import { RouteDataArgs, useRouteData } from 'solid-start';
import {
  AdminOrganizationsRouteQuery,
  AdminOrganizationsRouteQueryVariables,
  AdminOrganizationsRouteRowPropsFragment,
} from './__generated__/(organizations)';
import { PageHeading } from '~/components/page-heading';
import { createAdminClientOrRedirect } from '~/util/gql/server';
import Table from '~/components/admin/table';
import Pagination from '~/components/pagination';

const PAGE_SIZE = 60;

export function routeData({ location }: RouteDataArgs) {
  const metaData = createServerData$(
    async ([, after = null, before = null], { request }) => {
      const client = await createAdminClientOrRedirect(request);

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
    },
    {
      key: () => [
        'adminOrganizations',
        location.query['after'],
        location.query['before'],
      ],
    },
  );

  return metaData;
}

export default function AdminOrganizationsRoute() {
  const data = useRouteData<typeof routeData>();

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
