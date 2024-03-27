import { gql } from 'graphql-request';
import {
  type RouteDefinition,
  cache,
  useLocation,
  createAsync,
} from '@solidjs/router';
import type {
  TrendingRouteDataQuery,
  TrendingRouteDataQueryVariables,
} from './__generated__/trending';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';
import { UploadCardFields } from '~/util/gql/fragments';
import { UploadGrid } from '~/components/upload-grid';
import Pagination from '~/components/pagination';

const PAGE_SIZE = 60;

const loadData = cache(async function (
  after: string | null,
  before: string | null,
) {
  'use server';
  const client = await getAuthenticatedClientOrRedirect();
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
}, 'trending');

export const route = {
  load: ({ location }) => {
    void loadData(
      location.query['after'] ?? null,
      location.query['before'] ?? null,
    );
  },
} satisfies RouteDefinition;

export default function TrendingRoute() {
  const location = useLocation();
  const data = createAsync(() =>
    loadData(location.query['after'] ?? null, location.query['before'] ?? null),
  );

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
