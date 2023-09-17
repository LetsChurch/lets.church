import { For } from 'solid-js';
import { RouteDataArgs, Title, useParams, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import invariant from 'tiny-invariant';
import { gql } from 'graphql-request';
import type {
  SeriesRouteDataQuery,
  SeriesRouteDataQueryVariables,
} from './__generated__/[id]';
import { MediaRow, MediaRowFragment } from '~/components/media-row';
import { createAuthenticatedClient } from '~/util/gql/server';
import H1 from '~/components/content/h1';

export function routeData({ params }: RouteDataArgs) {
  const id = params['id'];
  invariant(id, 'No id provided to series route');

  const data = createServerData$(
    async ([, id], { request }) => {
      const client = await createAuthenticatedClient(request);

      return client.request<
        SeriesRouteDataQuery,
        SeriesRouteDataQueryVariables
      >(
        gql`
          ${MediaRowFragment}

          query SeriesRouteData($id: ShortUuid!) {
            uploadListById(id: $id) {
              id
              title
              uploads {
                edges {
                  node {
                    upload {
                      id
                      ...MediaRowProps
                    }
                  }
                }
              }
            }
          }
        `,
        {
          id,
        },
      );
    },
    {
      key: () => ['series', id] as const,
    },
  );

  return data;
}

export default function SeriesRoute() {
  const data = useRouteData<typeof routeData>();
  const params = useParams<{ id: string }>();

  return (
    <div class="space-y-5">
      <Title>{data()?.uploadListById.title ?? '...'} | Let's Church</Title>
      <H1>{data()?.uploadListById.title ?? '...'}</H1>
      <For each={data()?.uploadListById.uploads.edges}>
        {(edge) => (
          <MediaRow
            href={`/media/${edge.node.upload.id}?${new URLSearchParams({
              series: params.id,
            })}`}
            uploadProps={edge.node.upload}
          />
        )}
      </For>
    </div>
  );
}
