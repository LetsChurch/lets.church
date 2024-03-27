import { z } from 'zod';
import { gql } from 'graphql-request';
import { Show } from 'solid-js';
import { type RouteDefinition, cache, createAsync } from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import type {
  VerifyNewsletterSubscriptionMutation,
  VerifyNewsletterSubscriptionMutationVariables,
} from './__generated__/verify';
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
    VerifyNewsletterSubscriptionMutation,
    VerifyNewsletterSubscriptionMutationVariables
  >(
    gql`
      mutation VerifyNewsletterSubscription(
        $subscriptionId: ShortUuid!
        $emailKey: ShortUuid!
      ) {
        verifyNewsletterSubscription(
          subscriptionId: $subscriptionId
          emailKey: $emailKey
        )
      }
    `,
    { subscriptionId, emailKey },
  );

  return res.verifyNewsletterSubscription;
}, 'newsletter-verify');

export const route = {
  load: () => loadData(),
} satisfies RouteDefinition;

export default function NewsletterVerifyRoute() {
  const data = createAsync(() => loadData());

  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <Show
          when={data()}
          fallback={
            <>
              <H1>Error!</H1>
              <P>There was an error confirming your newsletter subscription.</P>
            </>
          }
        >
          <H1>Subscription Confirmed!</H1>
          <P>Your newsletter subscription has been confirmed!</P>
        </Show>
      </div>
    </div>
  );
}
