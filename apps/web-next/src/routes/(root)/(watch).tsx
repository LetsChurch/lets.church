import { Show } from 'solid-js';
import { gql } from 'graphql-request';
import { A, createAsync } from '@solidjs/router';
import { Link } from '@solidjs/meta';
import SubscribeIcon from '@tabler/icons/rss.svg?component-solid';
import type {
  HomepageDataQuery,
  HomepageDataQueryVariables,
} from './__generated__/(watch)';
import { getAuthenticatedClient } from '~/util/gql/server';
import { getSessionJwt } from '~/util/session';
import { UploadCardFields } from '~/util/gql/fragments';
import { UploadGrid } from '~/components/upload-grid';
import Newsletter from '~/components/newsletter';
import { useUser } from '~/util/user-context';
import Og from '~/components/og';

const getHomepageData = async function () {
  'use server';
  const client = await getAuthenticatedClient();
  const res = await client.request<
    HomepageDataQuery,
    HomepageDataQueryVariables
  >(
    gql`
      ${UploadCardFields}

      query HomepageData($loggedIn: Boolean!) {
        subscriptionUploads: mySubscriptionUploadRecords(first: 5)
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

        trendingUploads: uploadRecords(orderBy: trending, first: 60) {
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
    { loggedIn: !!(await getSessionJwt()) }, // TODO: Validate JWT
  );

  return res;
};

function SeeMoreLink(props: { to: 'subscriptions' | 'trending' }) {
  return (
    <div class="mt-6 flex justify-end">
      <A
        href={`/${props.to}`}
        class="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        See More
      </A>
    </div>
  );
}

export default function WatchRoute() {
  const data = createAsync(getHomepageData);
  const user = useUser();

  return (
    <>
      <Og
        title="Let's Church"
        description="Free Christian Videos with No Ads"
      />
      <Link
        rel="alternate"
        type="application/rss+xml"
        title="RSS 2.0"
        href="/media/rss.xml"
      />
      <h3 class="mb-3 mt-5 text-base font-semibold leading-6 text-gray-900">
        Subscriptions
      </h3>
      <Show
        when={(data()?.subscriptionUploads?.edges.length ?? 0) > 0}
        fallback={
          <div class="relative mb-6 block w-full space-y-5 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
            <SubscribeIcon class="mx-auto h-12 w-12 text-gray-400" />
            <span class="mt-2 block text-sm font-semibold text-gray-900">
              There aren't any videos to show you from your subscriptions. Check
              out some trending videos or subscribe to some channels!
            </span>
          </div>
        }
      >
        <UploadGrid edges={data()?.subscriptionUploads?.edges ?? []} />
        <SeeMoreLink to="subscriptions" />
      </Show>
      <h3 class="mb-3 mt-5 text-base font-semibold leading-6 text-gray-900">
        Trending
      </h3>
      <UploadGrid edges={data()?.trendingUploads?.edges ?? []} />
      <SeeMoreLink to="trending" />
      <Show when={!user()?.subscribedToNewsletter}>
        <Newsletter />
      </Show>
    </>
  );
}
