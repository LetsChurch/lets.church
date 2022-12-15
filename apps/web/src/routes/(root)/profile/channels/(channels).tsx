import { For } from 'solid-js';
import { useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import ChannelCard from '~/components/channel-card';
import { PageHeading } from '~/components/page-heading';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';
import type { MyChannelsQuery } from './__generated__/(channels)';

export function routeData() {
  return createServerData$(async (_, { request }) => {
    const client = await createAuthenticatedClientOrRedirect(request);

    return client.request<MyChannelsQuery>(gql`
      query MyChannels {
        me {
          channelMembershipsConnection {
            edges {
              node {
                channel {
                  id
                  name
                }
              }
            }
          }
        }
      }
    `);
  });
}

export default function ChannelsRoute() {
  const data = useRouteData<typeof routeData>();

  return (
    <>
      <PageHeading
        title="Channels"
        actions={[{ label: 'New Channel', variant: 'primary', href: 'new' }]}
      />
      <ul
        role="list"
        class="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
      >
        <For each={data()?.me?.channelMembershipsConnection.edges}>
          {(edge) => (
            <li>
              <ChannelCard
                id={edge?.node.channel.id}
                name={edge?.node.channel.name ?? 'Unnamed Channel'}
              />
            </li>
          )}
        </For>
      </ul>
    </>
  );
}
