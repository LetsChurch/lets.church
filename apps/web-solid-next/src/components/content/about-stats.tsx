import { gql } from 'graphql-request';
import humanFormat from 'human-format';
import { cache, createAsync } from '@solidjs/router';
import type {
  AboutPageDataQuery,
  AboutPageDataQueryVariables,
} from './__generated__/about-stats';
import { getAuthenticatedClient } from '~/util/gql/server';

const getData = cache(async () => {
  'use server';
  const client = await getAuthenticatedClient();

  const res = await client.request<
    AboutPageDataQuery,
    AboutPageDataQueryVariables
  >(gql`
    query AboutPageData {
      stats {
        totalUploadSeconds
        totalUploads
      }
    }
  `);

  return res;
}, 'about-stats');

export default function AboutStats() {
  const data = createAsync(getData);

  return (
    <>
      <dl class="mt-36 grid grid-cols-1 gap-x-8 gap-y-16 text-center lg:grid-cols-3">
        <div class="mx-auto flex max-w-xs flex-col gap-y-4">
          <dt class="text-base leading-7 text-gray-600">Days of Content</dt>
          <dd class="order-first text-3xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            {humanFormat(
              (data()?.stats.totalUploadSeconds ?? 0) / (60 ** 2 * 24),
            )}
          </dd>
        </div>
        <div class="mx-auto flex max-w-xs flex-col gap-y-4">
          <dt class="text-base leading-7 text-gray-600">Uploads</dt>
          <dd class="order-first text-3xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            {humanFormat(data()?.stats.totalUploads ?? 0)}
          </dd>
        </div>
        <div class="mx-auto flex max-w-xs flex-col gap-y-4">
          <dt class="text-base leading-7 text-gray-600">No Cost</dt>
          <dd class="order-first text-3xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
            $0
          </dd>
        </div>
      </dl>
      <h2 class="mt-36 flex flex-col space-y-5 text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
        <small>Ready?</small>
        <strong class="text-5xl font-bold text-indigo-500">Let's Church</strong>
      </h2>
    </>
  );
}
