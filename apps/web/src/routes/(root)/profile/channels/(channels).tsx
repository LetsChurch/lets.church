import { For } from 'solid-js';
import { useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import ChannelCard from '~/components/channel-card';
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
      <div class="mt-2 mb-5 md:flex md:items-center md:justify-between">
        <div class="min-w-0 flex-1">
          <h2 class="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            My Channels
          </h2>
        </div>
        <div class="mt-4 flex flex-shrink-0 md:mt-0 md:ml-4">
          <button
            type="button"
            class="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 md:ml-3"
          >
            New Channel
          </button>
        </div>
      </div>
      <ul
        role="list"
        class="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4"
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
