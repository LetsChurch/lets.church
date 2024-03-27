import invariant from 'tiny-invariant';
import { For } from 'solid-js';
import { gql } from 'graphql-request';
import {
  type RouteDefinition,
  cache,
  createAsync,
  useParams,
} from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import { Link } from '@solidjs/meta';
import type {
  PublicChannelQuery,
  PublicChannelQueryVariables,
} from './__generated__/(slug)';
import { getAuthenticatedClient } from '~/util/gql/server';
import { PageHeading } from '~/components/page-heading';
import UploadCard from '~/components/upload-card';
import Pagination from '~/components/pagination';
import { UploadCardFields } from '~/util/gql/fragments';

const PAGE_SIZE = 60;

const loadChannel = cache(async (slug: string) => {
  'use server';
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? '');

  invariant(slug, 'Missing slug');

  const after = url.searchParams.get('after');
  const before = url.searchParams.get('before');

  const client = await getAuthenticatedClient();

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
}, 'loadChannel');

export const route = {
  load: ({ params }) => {
    const { slug } = params;
    invariant(slug, 'Missing channel slug');
    void loadChannel(slug);
  },
} satisfies RouteDefinition;

export default function ChannelRoute() {
  const params = useParams();
  const data = createAsync(() => {
    const { slug } = params;
    invariant(slug);
    return loadChannel(slug);
  });

  return (
    <>
      <PageHeading title={data()?.name ?? ''} />
      <Link
        rel="alternate"
        type="application/rss+xml"
        title="RSS 2.0"
        href={`/channel/${params['slug']}/rss.xml`}
      />
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
      />
    </>
  );
}
