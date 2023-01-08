import { For } from 'solid-js';
import { RouteDataArgs, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import Thumbnail from '~/components/thumbnail';
import { client, gql } from '~/util/gql/server';
import type { SearchQuery, SearchQueryVariables } from './__generated__/search';

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    async ([, q = '']) => {
      return client.request<SearchQuery, SearchQueryVariables>(
        gql`
          query Search($query: String!) {
            search(focus: UPLOADS, query: $query) {
              aggs {
                channelHitCount
                organizationHitCount
                transcriptHitCount
              }
              edges {
                cursor
                node {
                  __typename
                  id
                  ... on UploadSearchHit {
                    title {
                      marked
                    }
                    uploadRecord {
                      thumbnailBlurhash
                      thumbnailUrl
                      channel {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        { query: q },
      );
    },
    { key: () => ['search', location.query['q']] },
  );
}

function getUploadRecord(edge: SearchQuery['search']['edges'][number]) {
  if (edge.node.__typename !== 'UploadSearchHit') return undefined;
  return edge.node.uploadRecord;
}

function getTitle(edge: SearchQuery['search']['edges'][number]) {
  if (edge.node.__typename !== 'UploadSearchHit') return undefined;
  return edge.node.title;
}

export default function SearchRoute() {
  const data = useRouteData<typeof routeData>();

  return (
    <div>
      <For each={data()?.search.edges}>
        {(edge) => (
          <div class="group flex space-x-5">
            <div>
              <Thumbnail
                url={getUploadRecord(edge)?.thumbnailUrl}
                blurhash={getUploadRecord(edge)?.thumbnailBlurhash}
                width={352}
                height={198}
              />
            </div>
            <div>
              <h3
                class="[&_mark]:in-expo [&_mark]:out-expo text-2xl [&_mark]:bg-transparent [&_mark]:transition-colors [&_mark]:duration-200  group-hover:[&_mark]:bg-yellow-200"
                // eslint-disable-next-line solid/no-innerhtml
                innerHTML={getTitle(edge)?.marked ?? ''}
              />
              <p class="text-sm text-gray-500">123 Views &middot; 3 Days Ago</p>
              <p class="text-sm text-gray-500">
                {getUploadRecord(edge)?.channel.name} &middot;{' '}
                {getUploadRecord(edge)?.channel.id}
              </p>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
