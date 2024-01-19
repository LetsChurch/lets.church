import { gql } from 'graphql-request';
import * as z from 'zod';
import {
  action,
  cache,
  createAsync,
  redirect,
  useSubmission,
} from '@solidjs/router';
import { getRequestEvent } from 'solid-js/web';
import {
  ResetPasswordMutation,
  ResetPasswordMutationVariables,
} from './__generated__/reset-password';
import { Button, LabeledInput } from '~/components/form';
import { Turnstile } from '~/components/turnstile';
import validateTurnstile from '~/util/server/validate-turnstile';
import { getAuthenticatedClient } from '~/util/gql/server';

const ResetPasswordSchema = z.object({
  id: z.string().uuid(),
  password: z.string(),
});

const routeData = cache(async () => {
  'use server';
  const event = getRequestEvent();
  const id = new URL(event?.request.url ?? '').searchParams.get('id');

  if (!id) {
    throw redirect('/');
  }

  return id;
}, 'reset-password');

export const route = {
  load: () => routeData(),
};

const resetPassword = action(async (form: FormData) => {
  'use server';
  const client = await getAuthenticatedClient();
  await validateTurnstile(form);

  const { id, password } = ResetPasswordSchema.parse(
    Object.fromEntries(['id', 'password'].map((p) => [p, form.get(p)])),
  );

  const res = await client.request<
    ResetPasswordMutation,
    ResetPasswordMutationVariables
  >(
    gql`
      mutation ResetPassword($id: Uuid!, $password: String!) {
        resetPassword(id: $id, password: $password)
      }
    `,
    { id, password },
  );

  if (!res.resetPassword) {
    throw redirect('/');
  }

  throw redirect('/auth/login');
});

export default function ResetPasswordRoute() {
  const data = createAsync(routeData);
  const submission = useSubmission(resetPassword);

  return (
    <>
      <div class="space-y-6 sm:mx-auto sm:w-full sm:max-w-md">
        <h2 class="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Reset Password
        </h2>
        <p class="text-center text-sm">
          Enter a new password for your account below.
        </p>
      </div>
      <form
        action={resetPassword}
        method="post"
        class="mx-auto mt-6 max-w-md space-y-6"
      >
        <input type="hidden" name="id" value={data() ?? ''} />
        <LabeledInput name="password" label="New Password" type="password" />
        <Turnstile class="flex justify-center" />
        <Button type="submit" class="w-full" disabled={submission.pending}>
          Reset Password
        </Button>
      </form>
    </>
  );
}
