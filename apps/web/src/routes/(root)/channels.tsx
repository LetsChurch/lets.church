import { For } from 'solid-js';
import { gql } from 'graphql-request';
import groupBy from 'just-group-by';
import { useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import sortBy from 'just-sort-by';
import type { ChannelsListQuery } from './__generated__/channels';
import A from '~/components/content/a';
import { createAuthenticatedClient } from '~/util/gql/server';

export function routeData() {
  return createServerData$(async (_, { request }) => {
    const client = await createAuthenticatedClient(request);
    const res = await client.request<ChannelsListQuery>(gql`
      query ChannelsList {
        channelsConnection(first: 100) {
          edges {
            node {
              name
              slug
            }
          }
        }
      }
    `);

    const groups = groupBy(
      res.channelsConnection.edges.map((e) => e.node),
      (ch) => ch.name.at(0)?.toUpperCase() ?? '???',
    );
    const entries = Object.entries(groups).map(
      ([k, v]) => [k, sortBy(v, ({ name }) => name)] as const,
    );
    return sortBy(entries, ([k]) => k);
  });
}

export default function AboutLayout() {
  const data = useRouteData<typeof routeData>();

  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="prose mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <h1>Channels</h1>
        <For each={data()}>
          {(group) => (
            <>
              <h2>{group[0] ?? ''}</h2>
              <ul>
                <For each={group[1]}>
                  {(ch) => (
                    <li>
                      <A href={`/channel/${ch.slug}`}>{ch.name}</A>
                    </li>
                  )}
                </For>
              </ul>
            </>
          )}
        </For>
      </div>
    </div>
  );
}
