import { type RouteDataArgs, useRouteData } from 'solid-start';
import { createServerData$ } from 'solid-start/server';
import { gql } from 'graphql-request';
import type {
  TrendingRouteDataQuery,
  TrendingRouteDataQueryVariables,
} from './__generated__/trending';
import { createAuthenticatedClientOrRedirect } from '~/util/gql/server';
import { UploadCardFields } from '~/util/gql/fragments';
import { UploadGrid } from '~/components/upload-grid';
import Pagination from '~/components/pagination';

const PAGE_SIZE = 60;

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    async ([, after = null, before = null], { request }) => {
      const client = await createAuthenticatedClientOrRedirect(request);
      return client.request<
        TrendingRouteDataQuery,
        TrendingRouteDataQueryVariables
      >(
        gql`
          ${UploadCardFields}
          query TrendingRouteData(
            $first: Int
            $after: String
            $last: Int
            $before: String
          ) {
            uploadRecords(
              orderBy: trending
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
          'trending',
          location.query['after'],
          location.query['before'],
        ] as const,
    },
  );
}

export default function TrendingRoute() {
  const data = useRouteData<typeof routeData>();

  return (
    <>
      <h3 class="mb-3 text-base font-semibold leading-6 text-gray-900">
        Trending
      </h3>
      <UploadGrid edges={data()?.uploadRecords?.edges ?? []} />
      <Pagination
        hasNextPage={data()?.uploadRecords?.pageInfo.hasNextPage ?? false}
        hasPreviousPage={
          data()?.uploadRecords?.pageInfo.hasPreviousPage ?? false
        }
        startCursor={data()?.uploadRecords?.pageInfo.startCursor ?? ''}
        endCursor={data()?.uploadRecords?.pageInfo.endCursor ?? ''}
      />
    </>
  );
}
