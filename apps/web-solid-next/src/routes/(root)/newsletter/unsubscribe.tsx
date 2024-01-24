import { Show } from 'solid-js';
import { z } from 'zod';
import { gql } from 'graphql-request';
import { type RouteDefinition, cache, createAsync } from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import type {
  UnsubscribeFromNewsletterMutation,
  UnsubscribeFromNewsletterMutationVariables,
} from './__generated__/unsubscribe';
import H1 from '~/components/content/h1';
import P from '~/components/content/p';
import { getAuthenticatedClient } from '~/util/gql/server';

const QuerySchema = z.object({
  subscriptionId: z.string(),
  emailKey: z.string(),
});

const loadData = cache(async function () {
  'use server';
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? '');

  const client = await getAuthenticatedClient();

  const { subscriptionId, emailKey } = QuerySchema.parse(
    Object.fromEntries(
      ['subscriptionId', 'emailKey'].map((k) => [k, url.searchParams.get(k)]),
    ),
  );

  const res = await client.request<
    UnsubscribeFromNewsletterMutation,
    UnsubscribeFromNewsletterMutationVariables
  >(
    gql`
      mutation UnsubscribeFromNewsletter(
        $subscriptionId: ShortUuid!
        $emailKey: ShortUuid!
      ) {
        unsubscribeFromNewsletter(
          subscriptionId: $subscriptionId
          emailKey: $emailKey
        )
      }
    `,
    { subscriptionId, emailKey },
  );

  return res.unsubscribeFromNewsletter;
}, 'newsletter-unsubscribe');

export const route: RouteDefinition = {
  load: () => loadData(),
};

export default function NewsletterUnsubscribeRoute() {
  const data = createAsync(loadData);

  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <Show
          when={data()}
          fallback={
            <>
              <H1>Error!</H1>
              <P>
                There was an error unsubscribing from the Let's Church
                newsletter.
              </P>
            </>
          }
        >
          <H1>Unsubscribed!</H1>
          <P>You have been unsubscribed from the Let's Church newsletter.</P>
        </Show>
      </div>
    </div>
  );
}
