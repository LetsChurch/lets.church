import { gql } from 'graphql-request';
import { createServerData$ } from 'solid-start/server';
import { RouteDataArgs, useRouteData } from 'solid-start';
import {
  AdminChannelsRouteQuery,
  AdminChannelsRouteQueryVariables,
  AdminChannelsRouteRowPropsFragment,
} from './__generated__/(channels)';
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
        AdminChannelsRouteQuery,
        AdminChannelsRouteQueryVariables
      >(
        gql`
          fragment AdminChannelsRouteRowProps on Channel {
            id
            name
            slug
          }

          query AdminChannelsRoute(
            $after: String
            $before: String
            $first: Int
            $last: Int
          ) {
            channelsConnection(
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
                  ...AdminChannelsRouteRowProps
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
        'adminChannels',
        location.query['after'],
        location.query['before'],
      ],
    },
  );

  return metaData;
}

export default function AdminChannelsRoute() {
  const data = useRouteData<typeof routeData>();

  return (
    <div>
      <PageHeading
        title="Admin: Channels"
        actions={[{ variant: 'primary', label: 'New Channel', href: 'new' }]}
      />
      <Table<{ node: AdminChannelsRouteRowPropsFragment }>
        columns={[
          { title: 'Name', render: (d) => d.node.name },
          { title: 'Slug', render: (d) => d.node.slug },
          {
            title: 'Edit',
            titleSrOnly: true,
            render: (d) => (
              <a href="#" class="text-indigo-600 hover:text-indigo-900">
                Edit<span class="sr-only">, {d.node.name}</span>
              </a>
            ),
          },
        ]}
        data={data()?.channelsConnection.edges ?? []}
      />
      <Pagination
        hasPreviousPage={
          data()?.channelsConnection.pageInfo.hasPreviousPage ?? false
        }
        hasNextPage={data()?.channelsConnection.pageInfo.hasNextPage ?? false}
        startCursor={data()?.channelsConnection.pageInfo.startCursor ?? ''}
        endCursor={data()?.channelsConnection.pageInfo.endCursor ?? ''}
      />
    </div>
  );
}
