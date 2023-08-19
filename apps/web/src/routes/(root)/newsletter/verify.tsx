import { createServerData$ } from 'solid-start/server';
import { z } from 'zod';
import { gql } from 'graphql-request';
import { useRouteData } from 'solid-start';
import { Show } from 'solid-js';
import type {
  VerifyNewsletterSubscriptionMutation,
  VerifyNewsletterSubscriptionMutationVariables,
} from './__generated__/verify';
import { client } from '~/util/gql/server';
import H1 from '~/components/content/h1';
import P from '~/components/content/p';

const QuerySchema = z.object({
  subscriptionId: z.string(),
  emailKey: z.string(),
});

export function routeData() {
  return createServerData$(async (_, { request }) => {
    const url = new URL(request.url);

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
  });
}

export default function NewsletterVerifyRoute() {
  const data = useRouteData<typeof routeData>();

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
