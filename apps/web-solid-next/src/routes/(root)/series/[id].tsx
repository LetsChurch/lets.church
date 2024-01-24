import { For } from 'solid-js';
import invariant from 'tiny-invariant';
import { gql } from 'graphql-request';
import {
  type RouteDefinition,
  cache,
  createAsync,
  useParams,
} from '@solidjs/router';
import { Title } from '@solidjs/meta';
import type {
  SeriesRouteDataQuery,
  SeriesRouteDataQueryVariables,
} from './__generated__/[id]';
import { MediaRow, MediaRowFragment } from '~/components/media-row';
import { getAuthenticatedClient } from '~/util/gql/server';
import H1 from '~/components/content/h1';

const loadData = cache(async function (id: string) {
  'use server';
  const client = await getAuthenticatedClient();

  return client.request<SeriesRouteDataQuery, SeriesRouteDataQueryVariables>(
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
}, 'series');

export const route: RouteDefinition = {
  load: ({ params }) => {
    const { id } = params;
    invariant(id, 'No id provided to series route');
    return loadData(id);
  },
};

export default function SeriesRoute() {
  const params = useParams<{ id: string }>();
  const data = createAsync(() => loadData(params['id']));

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
