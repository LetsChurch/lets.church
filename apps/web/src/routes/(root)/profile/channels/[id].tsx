import { For } from 'solid-js';
import { RouteDataArgs, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import invariant from 'tiny-invariant';
import { PageHeading } from '~/components/page-heading';
import UploadCard from '~/components/upload-card';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';
import type { ChannelQuery, ChannelQueryVariables } from './__generated__/[id]';

export function routeData({ params }: RouteDataArgs<{ id: string }>) {
  return createServerData$(
    async ([, id], { request }) => {
      invariant(id, 'No id provided');
      const client = await createAuthenticatedClientOrRedirect(request);

      return client.request<ChannelQuery, ChannelQueryVariables>(
        gql`
          query Channel($id: ShortUuid!, $after: String) {
            channelById(id: $id) {
              name
              uploadsConnection(first: 20, after: $after) {
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
        { id },
      );
    },
    { key: () => ['channels', params['id']] },
  );
}

export default function ChannelRoute() {
  const data = useRouteData<typeof routeData>();

  return (
    <>
      <PageHeading title={`Channel: ${data()?.channelById.name}`} backButton />
      <h2 class="text-xl">Uploads</h2>
      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <For each={data()?.channelById.uploadsConnection.edges}>
          {(edge) => (
            <li>
              <UploadCard
                title={edge.node.title ?? 'Untitled Upload'}
                channel={data()?.channelById.name ?? 'Unnamed Channel'}
                href="#"
                avatarUrl="https://images.unsplash.com/photo-1477672680933-0287a151330e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
              />
            </li>
          )}
        </For>
      </ul>
    </>
  );
}
