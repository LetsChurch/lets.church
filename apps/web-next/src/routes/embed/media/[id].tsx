import {
  type RouteDefinition,
  cache,
  createAsync,
  redirect,
  useParams,
} from '@solidjs/router';
import { gql } from 'graphql-request';
import { Show } from 'solid-js';
import invariant from 'tiny-invariant';
import {
  EmbedMediaRouteMetaDataQuery,
  EmbedMediaRouteMetaDataQueryVariables,
} from './__generated__/[id]';
import { getAuthenticatedClient } from '~/util/gql/server';
import Player from '~/components/media/player';

const loadMediaMetadata = cache(async (id: string) => {
  'use server';
  invariant(id, 'Missing id');

  const client = await getAuthenticatedClient();

  const { data, errors } = await client.rawRequest<
    EmbedMediaRouteMetaDataQuery,
    EmbedMediaRouteMetaDataQueryVariables
  >(
    gql`
      query EmbedMediaRouteMetaData($id: ShortUuid!) {
        data: uploadRecordById(id: $id) {
          id
          title
          lengthSeconds
          publishedAt
          channel {
            id
            slug
            name
            avatarUrl(resize: { width: 96, height: 96 })
            defaultThumbnailUrl
            userIsSubscribed
          }
          mediaSource
          audioSource
          thumbnailUrl
          peaksDatUrl
          peaksJsonUrl
        }
      }
    `,
    {
      id,
    },
  );

  if (errors && errors.length > 0) {
    throw redirect('/404');
  }

  return data;
}, 'media-meta');

export const route = {
  load: ({ params }) => {
    const id = params['id'];
    invariant(id, 'Missing id');
    void loadMediaMetadata(id);
  },
} satisfies RouteDefinition;

export default function EmbedMediaRoute() {
  const params = useParams<{ id: string }>();
  const metadata = createAsync(() => loadMediaMetadata(params.id));

  return (
    <Show when={params.id} keyed>
      {(id) => (
        <Player
          id={id}
          videoSource={metadata()?.data.mediaSource}
          audioSource={metadata()?.data.audioSource}
          peaksDatUrl={metadata()?.data.peaksDatUrl}
          peaksJsonUrl={metadata()?.data.peaksJsonUrl}
          lengthSeconds={metadata()?.data.lengthSeconds ?? 0}
          fluid
        />
      )}
    </Show>
  );
}
