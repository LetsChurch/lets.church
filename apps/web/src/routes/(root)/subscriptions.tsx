import { RouteDataArgs, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import type {
  SubscriptionsDataQuery,
  SubscriptionsDataQueryVariables,
} from './__generated__/subscriptions';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';
import { UploadCardFields } from '~/util/gql/fragments';
import { UploadGrid } from '~/components/upload-grid';
import Pagination from '~/components/pagination';

const PAGE_SIZE = 60;

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    async ([, after = null, before = null], { request }) => {
      const client = await createAuthenticatedClientOrRedirect(request);
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
    },
    {
      key: () =>
        [
          'subscriptions',
          location.query['after'],
          location.query['before'],
        ] as const,
    },
  );
}

export default function SubscriptionsRoute() {
  const data = useRouteData<typeof routeData>();

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
