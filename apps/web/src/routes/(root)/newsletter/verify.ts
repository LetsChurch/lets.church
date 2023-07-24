import { APIEvent, redirect } from 'solid-start/api';
import { z } from 'zod';
import type {
  VerifyNewsletterSubscriptionMutation,
  VerifyNewsletterSubscriptionMutationVariables,
} from './__generated__/verify';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';

const QuerySchema = z.object({
  subscriptionId: z.string(),
  emailKey: z.string(),
});

export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);

  const { subscriptionId, emailKey } = QuerySchema.parse(
    Object.fromEntries(
      ['subscriptionId', 'emailKey'].map((k) => [k, url.searchParams.get(k)]),
    ),
  );

  const client = await createAuthenticatedClientOrRedirect(request);

  await client.request<
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

  return redirect('/');
}
