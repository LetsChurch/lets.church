import { For } from 'solid-js';
import invariant from 'tiny-invariant';
import { gql } from 'graphql-request';
import { type RouteDefinition, cache, createAsync } from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import type {
  ProfileChannelsQuery,
  ProfileChannelsQueryVariables,
} from './__generated__/(index)';
import { PageHeading } from '~/components/page-heading';
import Pagination from '~/components/pagination';
import UploadCard from '~/components/upload-card';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';
import { UploadCardFields } from '~/util/gql/fragments';

const PAGE_SIZE = 60;

const loadChannel = cache(async function () {
  'use server';
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? '');
  const id = url.searchParams.get('id');

  invariant(id, 'No id provided');

  const after = url.searchParams.get('after');
  const before = url.searchParams.get('before');

  const client = await getAuthenticatedClientOrRedirect();

  const { channelById } = await client.request<
    ProfileChannelsQuery,
    ProfileChannelsQueryVariables
  >(
    gql`
      ${UploadCardFields}

      query ProfileChannels(
        $id: ShortUuid!
        $first: Int
        $after: String
        $last: Int
        $before: String
      ) {
        channelById(id: $id) {
          id
          name
          avatarUrl(resize: { width: 96, height: 96 })
          uploadsConnection(
            first: $first
            after: $after
            last: $last
            before: $before
            includeUnlisted: true
            orderBy: publishedAt
          ) {
            totalCount
            pageInfo {
              startCursor
              endCursor
              hasNextPage
              hasPreviousPage
            }
            edges {
              node {
                ...UploadCardFields
              }
              cursor
            }
          }
        }
      }
    `,
    {
      id,
      after,
      before,
      first: after || !before ? PAGE_SIZE : null,
      last: before ? PAGE_SIZE : null,
    },
  );

  return channelById;
}, 'loadProfile');

export const route = {
  load: () => {
    void loadChannel();
  },
} satisfies RouteDefinition;

export default function ProfileChannelRoute() {
  const data = createAsync(() => loadChannel());

  return (
    <>
      <PageHeading title={`Channel: ${data()?.name}`} backButton />
      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <For each={data()?.uploadsConnection.edges}>
          {(edge) => (
            <li>
              <UploadCard
                href={`/upload/?id=${edge.node.id}`}
                data={edge.node}
              />
            </li>
          )}
        </For>
      </ul>
      <Pagination
        hasPreviousPage={
          data()?.uploadsConnection.pageInfo.hasPreviousPage ?? false
        }
        hasNextPage={data()?.uploadsConnection.pageInfo.hasNextPage ?? false}
        startCursor={data()?.uploadsConnection.pageInfo.startCursor ?? ''}
        endCursor={data()?.uploadsConnection.pageInfo.endCursor ?? ''}
      />
    </>
  );
}
