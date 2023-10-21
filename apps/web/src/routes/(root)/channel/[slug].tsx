import { type RouteDataArgs, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import invariant from 'tiny-invariant';
import { For } from 'solid-js';
import { gql } from 'graphql-request';
import type {
  PublicChannelQuery,
  PublicChannelQueryVariables,
} from './__generated__/[slug]';
import { createAuthenticatedClient } from '~/util/gql/server';
import { PageHeading } from '~/components/page-heading';
import UploadCard from '~/components/upload-card';
import Pagination from '~/components/pagination';
import { UploadCardFields } from '~/util/gql/fragments';

const PAGE_SIZE = 60;

export function routeData({ params, location }: RouteDataArgs) {
  return createServerData$(
    async ([, slug, after = null, before = null], { request }) => {
      invariant(slug, 'No slug provided');
      const client = await createAuthenticatedClient(request);

      const { channelBySlug } = await client.request<
        PublicChannelQuery,
        PublicChannelQueryVariables
      >(
        gql`
          ${UploadCardFields}

          query PublicChannel(
            $slug: String!
            $first: Int
            $after: String
            $last: Int
            $before: String
          ) {
            channelBySlug(slug: $slug) {
              id
              name
              avatarUrl(resize: { width: 96, height: 96 })
              uploadsConnection(
                first: $first
                after: $after
                last: $last
                before: $before
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
          slug,
          after,
          before,
          first: after || !before ? PAGE_SIZE : null,
          last: before ? PAGE_SIZE : null,
        },
      );

      return channelBySlug;
    },
    {
      key: () => [
        'channels',
        params['slug'],
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
      <PageHeading title={data()?.name ?? ''} />
      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <For each={data()?.uploadsConnection.edges}>
          {(edge) => (
            <li>
              <UploadCard href={`/media/${edge.node.id}`} data={edge.node} />
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
