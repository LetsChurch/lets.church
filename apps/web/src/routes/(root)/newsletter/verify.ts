import { APIEvent, redirect } from 'solid-start/api';
import { z } from 'zod';
import { gql } from 'graphql-request';
import type {
  VerifyNewsletterSubscriptionMutation,
  VerifyNewsletterSubscriptionMutationVariables,
} from './__generated__/verify';
import { flashSuccess } from '~/util/session';
import { client } from '~/util/gql/server';

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

  const res = await flashSuccess(
    request,
    'Your newsletter subscription has been confirmed!',
  );

  return redirect('/', res);
}
