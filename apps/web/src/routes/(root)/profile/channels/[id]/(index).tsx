import { For } from 'solid-js';
import { RouteDataArgs, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import invariant from 'tiny-invariant';
import { gql } from 'graphql-request';
import type {
  ProfileChannelsQuery,
  ProfileChannelsQueryVariables,
} from './__generated__/(index)';
import { PageHeading } from '~/components/page-heading';
import Pagination from '~/components/pagination';
import UploadCard from '~/components/upload-card';
import { createAuthenticatedClientOrRedirect } from '~/util/gql/server';
import { UploadCardFields } from '~/util/gql/fragments';

const PAGE_SIZE = 60;

export function routeData({ params, location }: RouteDataArgs) {
  return createServerData$(
    async ([, id, after = null, before = null], { request }) => {
      invariant(id, 'No id provided');
      const client = await createAuthenticatedClientOrRedirect(request);

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
              avatarUrl
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
    },
    {
      key: () => [
        'channels',
        params['id'],
        location.query['after'],
        location.query['before'],
      ],
      reconcileOptions: {
        key: 'id',
      },
    },
  );
}

export default function ChannelRoute() {
  const data = useRouteData<typeof routeData>();

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
        label={
          <>
            Showing{' '}
            <span class="font-medium">
              {data()?.uploadsConnection.edges.length}
            </span>{' '}
            of{' '}
            <span class="font-medium">
              {data()?.uploadsConnection.totalCount}
            </span>{' '}
            uploads
          </>
        }
      />
    </>
  );
}
