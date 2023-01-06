import { RouteDataArgs, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import invariant from 'tiny-invariant';
import { client, gql } from '~/util/gql/server';
import type { SearchQuery, SearchQueryVariables } from './__generated__/search';

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    async ([, q]) => {
      invariant(q, 'Query is required');

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
                  id
                  ... on UploadSearchHit {
                    title {
                      marked
                      source
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

export default function SearchRoute() {
  const data = useRouteData<typeof routeData>();

  return (
    <div>
      <h1>Search!</h1>
      <pre>{JSON.stringify(data(), null, 2)}</pre>
    </div>
  );
}
