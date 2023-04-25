import { APIEvent, redirect } from 'solid-start/api';
import * as Z from 'zod';
import type {
  VerifyEmailMutation,
  VerifyEmailMutationVariables,
} from './__generated__/verify';
import { createAuthenticatedClientOrRedirect, gql } from '~/util/gql/server';

const QuerySchema = Z.object({
  userId: Z.string(),
  emailId: Z.string(),
  emailKey: Z.string(),
});

export async function GET({ request }: APIEvent) {
  const url = new URL(request.url);

  const { userId, emailId, emailKey } = QuerySchema.parse(
    Object.fromEntries(
      ['userId', 'emailId', 'emailKey'].map((k) => [
        k,
        url.searchParams.get(k),
      ]),
    ),
  );

  const client = await createAuthenticatedClientOrRedirect(request);

  await client.request<VerifyEmailMutation, VerifyEmailMutationVariables>(
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

  return redirect('/');
}