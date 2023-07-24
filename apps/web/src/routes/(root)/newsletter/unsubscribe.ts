import { APIEvent, redirect } from 'solid-start/api';
import { z } from 'zod';
import type {
  UnsubscribeFromNewsletterMutation,
  UnsubscribeFromNewsletterMutationVariables,
} from './__generated__/unsubscribe';
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

  return redirect('/');
}
