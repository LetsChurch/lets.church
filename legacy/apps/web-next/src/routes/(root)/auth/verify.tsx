import { Show } from 'solid-js';
import { z } from 'zod';
import { gql } from 'graphql-request';
import { getRequestEvent } from 'solid-js/web';
import { createAsync } from '@solidjs/router';
import type {
  VerifyEmailMutation,
  VerifyEmailMutationVariables,
} from './__generated__/verify';
import { getAuthenticatedClientOrRedirect } from '~/util/gql/server';

const QuerySchema = z.object({
  userId: z.string(),
  emailId: z.string(),
  emailKey: z.string(),
});

const routeData = async () => {
  'use server';
  const event = getRequestEvent();
  const url = new URL(event?.request.url ?? '');

  const { userId, emailId, emailKey } = QuerySchema.parse(
    Object.fromEntries(
      ['userId', 'emailId', 'emailKey'].map((k) => [
        k,
        url.searchParams.get(k),
      ]),
    ),
  );

  const client = await getAuthenticatedClientOrRedirect();

  const res = await client.request<
    VerifyEmailMutation,
    VerifyEmailMutationVariables
  >(
    gql`
      mutation VerifyEmail(
        $userId: ShortUuid!
        $emailId: ShortUuid!
        $emailKey: ShortUuid!
      ) {
        verifyEmail(userId: $userId, emailId: $emailId, emailKey: $emailKey)
      }
    `,
    { userId, emailId, emailKey },
  );

  return res.verifyEmail;
};

export default function EmailVerifyRoute() {
  const data = createAsync(routeData);

  return (
    <div class="bg-white px-6 py-3 lg:px-8">
      <div class="prose mx-auto max-w-3xl text-base leading-7 text-gray-700">
        <Show
          when={data()}
          fallback={
            <>
              <h1>Error!</h1>
              <p>There was an error verifying your email address.</p>
            </>
          }
        >
          <h1>Email Verified!</h1>
          <p>Your email address has been verified!</p>
        </Show>
      </div>
    </div>
  );
}
