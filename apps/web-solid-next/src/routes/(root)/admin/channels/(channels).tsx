import { gql } from 'graphql-request';
import { A, createAsync } from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import {
  AdminChannelsRouteQuery,
  AdminChannelsRouteQueryVariables,
  AdminChannelsRouteRowPropsFragment,
} from './__generated__/(channels)';
import { PageHeading } from '~/components/page-heading';
import { getAdminClientOrRedirect } from '~/util/gql/server';
import Table from '~/components/admin/table';
import Pagination from '~/components/pagination';

const PAGE_SIZE = 60;

const getAdminChannels = async () => {
  'use server';
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? '');
  const before = url.searchParams.get('before');
  const after = url.searchParams.get('after');
  const client = await getAdminClientOrRedirect();

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
};

export default function AdminChannelsRoute() {
  const data = createAsync(getAdminChannels);

  return (
    <div>
      <PageHeading
        title="Admin: Channels"
        actions={[
          {
            variant: 'primary',
            label: 'New Channel',
            href: '/admin/channels/edit',
          },
        ]}
      />
      <Table<{ node: AdminChannelsRouteRowPropsFragment }>
        columns={[
          { title: 'Name', render: (d) => d.node.name },
          { title: 'Slug', render: (d) => d.node.slug },
          {
            title: 'Edit',
            titleSrOnly: true,
            render: (d) => (
              <A
                href={`/admin/channels/edit?id=${d.node.id}`}
                class="text-indigo-600 hover:text-indigo-900"
              >
                Edit<span class="sr-only">, {d.node.name}</span>
              </A>
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
