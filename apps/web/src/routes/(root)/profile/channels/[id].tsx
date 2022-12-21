import { For } from 'solid-js';
import { RouteDataArgs, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import invariant from 'tiny-invariant';
import { PageHeading } from '~/components/page-heading';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';
import type { ChannelQuery, ChannelQueryVariables } from './__generated__/[id]';

export function routeData({ params }: RouteDataArgs<{ id: string }>) {
  return createServerData$(
    async ([oink, id], { request }) => {
      console.log({ oink });
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
      <For each={data()?.channelById.uploadsConnection.edges}>
        {(edge) => <h3>{edge.node.title}</h3>}
      </For>
    </>
  );
}
