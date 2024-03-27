import { For } from 'solid-js';
import { gql } from 'graphql-request';
import { type RouteDefinition, cache, createAsync } from '@solidjs/router';
import type { MyChannelsQuery } from './__generated__/(channels)';
import ChannelCard from '~/components/channel-card';
import { PageHeading } from '~/components/page-heading';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';

const loadChannels = cache(async () => {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();

  return client.request<MyChannelsQuery>(gql`
    query MyChannels {
      me {
        channelMembershipsConnection(first: 100) {
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
}, 'profileLoadChannels');

export const route = {
  load: () => {
    void loadChannels();
  },
} satisfies RouteDefinition;

export default function ProfileChannelsRoute() {
  const data = createAsync(() => loadChannels());

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
