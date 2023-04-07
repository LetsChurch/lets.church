import { For, Show } from 'solid-js';
import { createServerData$ } from 'solid-start/server';
import { useRouteData } from 'solid-start';
import SubscribeIcon from '@tabler/icons/rss.svg?component-solid';
import type {
  HomepageDataQuery,
  HomepageDataQueryVariables,
} from './__generated__/(watch)';
import UploadCard from '~/components/upload-card';
import { createAuthenticatedClient, gql } from '~/util/gql/server';
import { getSessionJwt } from '~/util/session';

export function routeData() {
  return createServerData$(
    async (_, { request }) => {
      const client = await createAuthenticatedClient(request);
      const res = await client.request<
        HomepageDataQuery,
        HomepageDataQueryVariables
      >(
        gql`
          fragment UploadCardFields on UploadRecord {
            id
            title
            thumbnailBlurhash
            thumbnailUrl
            channel {
              id
              name
              avatarUrl
            }
          }

          query HomepageData($loggedIn: Boolean!) {
            subscriptionUploads: mySubscriptionUploadRecords
              @include(if: $loggedIn) {
              pageInfo {
                hasNextPage
                startCursor
                endCursor
              }
              edges {
                cursor
                node {
                  ...UploadCardFields
                }
              }
            }

            hotUploads: uploadRecords(orderBy: trending) {
              pageInfo {
                hasNextPage
                startCursor
                endCursor
              }
              edges {
                cursor
                node {
                  ...UploadCardFields
                }
              }
            }
          }
        `,
        { loggedIn: !!(await getSessionJwt(request)) }, // TODO: Validate JWT
      );

      return res;
    },
    { key: ['home'] as const },
  );
}

export default function WatchRoute() {
  const data = useRouteData<typeof routeData>();

  return (
    <>
      <div class="mb-12">
        <h3 class="mb-3 text-base font-semibold leading-6 text-gray-900">
          Subscriptions
        </h3>
        <Show
          when={(data()?.subscriptionUploads?.edges.length ?? 0) > 0}
          fallback={
            <div class="relative block w-full space-y-5 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
              <SubscribeIcon class="mx-auto h-12 w-12 text-gray-400" />
              <span class="mt-2 block text-sm font-semibold text-gray-900">
                There aren't any videos to show you from your subscriptions.
                Check out some trending videos or subscribe to some channels!
              </span>
            </div>
          }
        >
          <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <For
              each={data()?.subscriptionUploads?.edges ?? []}
              fallback="No subscription uploads!"
            >
              {(edge) => (
                <li>
                  <UploadCard
                    title={edge.node.title}
                    channel={edge.node.channel.name}
                    href={`/media/${edge.node.id}`}
                    thumbnailUrl={edge.node.thumbnailUrl}
                    blurhash={edge.node.thumbnailBlurhash}
                    avatarUrl={edge.node.channel.avatarUrl ?? ''}
                  />
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
      <div class="mb-12">
        <h3 class="mb-3 text-base font-semibold leading-6 text-gray-900">
          Trending
        </h3>
        <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <For each={data()?.hotUploads?.edges ?? []}>
            {(edge) => (
              <li>
                <UploadCard
                  title={edge.node.title}
                  channel={edge.node.channel.name}
                  href={`/media/${edge.node.id}`}
                  thumbnailUrl={edge.node.thumbnailUrl}
                  blurhash={edge.node.thumbnailBlurhash}
                  avatarUrl={edge.node.channel.avatarUrl ?? ''}
                />
              </li>
            )}
          </For>
        </ul>
      </div>
    </>
  );
}
