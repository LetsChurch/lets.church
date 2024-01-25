import { gql } from 'graphql-request';
import {
  type RouteDefinition,
  cache,
  createAsync,
  useLocation,
} from '@solidjs/router';
import type {
  SubscriptionsDataQuery,
  SubscriptionsDataQueryVariables,
} from './__generated__/subscriptions';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';
import { UploadCardFields } from '~/util/gql/fragments';
import { UploadGrid } from '~/components/upload-grid';
import Pagination from '~/components/pagination';

const PAGE_SIZE = 60;

const loadData = cache(async function (
  after: string | null = null,
  before: string | null = null,
) {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();
  return client.request<
    SubscriptionsDataQuery,
    SubscriptionsDataQueryVariables
  >(
    gql`
      ${UploadCardFields}
      query SubscriptionsData(
        $first: Int
        $after: String
        $last: Int
        $before: String
      ) {
        mySubscriptionUploadRecords(
          first: $first
          after: $after
          last: $last
          before: $before
        ) {
          pageInfo {
            hasNextPage
            hasPreviousPage
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
    {
      after,
      before,
      first: after || !before ? PAGE_SIZE : null,
      last: before ? PAGE_SIZE : null,
    },
  );
}, 'subscriptions');

export const route: RouteDefinition = {
  load: ({ location }) =>
    loadData(location.query['after'], location.query['before']),
};

export default function SubscriptionsRoute() {
  const location = useLocation();
  const data = createAsync(() =>
    loadData(location.query['after'], location.query['before']),
  );

  return (
    <>
      <h3 class="mb-3 text-base font-semibold leading-6 text-gray-900">
        Subscriptions
      </h3>
      <UploadGrid edges={data()?.mySubscriptionUploadRecords?.edges ?? []} />
      <Pagination
        hasNextPage={
          data()?.mySubscriptionUploadRecords?.pageInfo.hasNextPage ?? false
        }
        hasPreviousPage={
          data()?.mySubscriptionUploadRecords?.pageInfo.hasPreviousPage ?? false
        }
        startCursor={
          data()?.mySubscriptionUploadRecords?.pageInfo.startCursor ?? ''
        }
        endCursor={
          data()?.mySubscriptionUploadRecords?.pageInfo.endCursor ?? ''
        }
      />
    </>
  );
}
