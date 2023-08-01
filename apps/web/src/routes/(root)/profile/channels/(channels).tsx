import { For } from 'solid-js';
import { useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import { gql } from 'graphql-request';
import type { MyChannelsQuery } from './__generated__/(channels)';
import ChannelCard from '~/components/channel-card';
import { PageHeading } from '~/components/page-heading';
import { createAuthenticatedClientOrRedirect } from '~/util/gql/server';

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
                  subscribersConnection {
                    totalCount
                  }
                  uploadsConnection {
                    totalCount
                  }
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
        /* TODO: Creating channels */
        /* actions={[{ label: 'New Channel', variant: 'primary', href: 'new' }]} */
      />
      <ul
        role="list"
        class="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
      >
        <For each={data()?.me?.channelMembershipsConnection.edges}>
          {(edge) => (
            <li>
              <ChannelCard
                id={edge.node.channel.id}
                name={edge.node.channel.name}
                subscribersCount={
                  edge.node.channel.subscribersConnection.totalCount
                }
                uploadsCount={edge.node.channel.uploadsConnection.totalCount}
              />
            </li>
          )}
        </For>
      </ul>
    </>
  );
}
