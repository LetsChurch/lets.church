import { For, Show } from 'solid-js';
import { A, RouteDataArgs, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import invariant from 'tiny-invariant';
import { PageHeading } from '~/components/page-heading';
import UploadCard from '~/components/upload-card';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';
import type { ChannelQuery, ChannelQueryVariables } from './__generated__/[id]';

const PAGE_SIZE = 12;

export function routeData({ params, location }: RouteDataArgs<{ id: string }>) {
  return createServerData$(
    async ([, id, after = null, before = null], { request }) => {
      invariant(id, 'No id provided');
      const client = await createAuthenticatedClientOrRedirect(request);

      const { channelById } = await client.request<
        ChannelQuery,
        ChannelQueryVariables
      >(
        gql`
          query Channel(
            $id: ShortUuid!
            $first: Int
            $after: String
            $last: Int
            $before: String
          ) {
            channelById(id: $id) {
              id
              name
              uploadsConnection(
                first: $first
                after: $after
                last: $last
                before: $before
              ) {
                totalCount
                pageInfo {
                  startCursor
                  endCursor
                  hasNextPage
                  hasPreviousPage
                }
                edges {
                  node {
                    id
                    title
                    createdAt
                  }
                  cursor
                }
              }
            }
          }
        `,
        {
          id,
          after,
          before,
          first: after || !before ? PAGE_SIZE : null,
          last: before ? PAGE_SIZE : null,
        },
      );

      return channelById;
    },
    {
      key: () => [
        'channels',
        params['id'],
        location.query['after'],
        location.query['before'],
      ],
      reconcileOptions: {
        key: 'id',
      },
    },
  );
}

export default function ChannelRoute() {
  const data = useRouteData<typeof routeData>();

  return (
    <>
      <PageHeading title={`Channel: ${data()?.name}`} backButton />
      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <For each={data()?.uploadsConnection.edges}>
          {(edge) => (
            <li>
              <UploadCard
                title={edge.node.title ?? 'Untitled Upload'}
                channel={data()?.name ?? 'Unnamed Channel'}
                href={`/upload/?id=${edge.node.id}`}
                avatarUrl="https://images.unsplash.com/photo-1477672680933-0287a151330e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
              />
            </li>
          )}
        </For>
      </ul>
      <nav
        class="mt-6 flex items-center justify-between"
        aria-label="Pagination"
      >
        <div class="hidden sm:block">
          <p class="text-sm text-gray-700">
            Showing{' '}
            <span class="font-medium">
              {data()?.uploadsConnection.edges.length}
            </span>{' '}
            of{' '}
            <span class="font-medium">
              {data()?.uploadsConnection.totalCount}
            </span>{' '}
            uploads
          </p>
        </div>
        <div class="flex flex-1 justify-between sm:justify-end">
          <Show when={data()?.uploadsConnection.pageInfo.hasPreviousPage}>
            <A
              href={`?before=${data()?.uploadsConnection.pageInfo.startCursor}`}
              class="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Previous Page
            </A>
          </Show>
          <Show when={data()?.uploadsConnection.pageInfo.hasNextPage}>
            <A
              href={`?after=${data()?.uploadsConnection.pageInfo.endCursor}`}
              class="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Next Page
            </A>
          </Show>
        </div>
      </nav>
    </>
  );
}
