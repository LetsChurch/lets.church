import { gql } from 'graphql-request';
import * as z from 'zod';
import { Show } from 'solid-js';
import { action, useSubmission } from '@solidjs/router';
import {
  ForgotPasswordMutation,
  ForgotPasswordMutationVariables,
} from './__generated__/forgot-password';
import { Button, LabeledInput } from '~/components/form';
import { Turnstile } from '~/components/turnstile';
import { getAuthenticatedClient } from '~/util/gql/server';
import validateTurnstile from '~/util/server/validate-turnstile';

const ForgotPasswordSchema = z.object({
  email: z.string(),
});

const submitForgotPassword = action(async (form: FormData) => {
  'use server';
  await validateTurnstile(form);
  const client = await getAuthenticatedClient();

  const { email } = ForgotPasswordSchema.parse(
    Object.fromEntries(['email'].map((p) => [p, form.get(p)])),
  );

  const res = await client.request<
    ForgotPasswordMutation,
    ForgotPasswordMutationVariables
  >(
    gql`
      mutation ForgotPassword($email: String!) {
        forgotPassword(email: $email)
      }
    `,
    { email },
  );

  return res;
});

export default function ForgotPasswordRoute() {
  const submission = useSubmission(submitForgotPassword);

  return (
    <>
      <div class="space-y-6 sm:mx-auto sm:w-full sm:max-w-md">
        <h2 class="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Forgot your password?
        </h2>
        <Show
          when={submission.result?.forgotPassword}
          fallback={
            <p class="text-center text-sm">
              Enter your email address below and if you have an account, we'll
              send an email with a link to reset your password.
            </p>
          }
        >
          <p class="text-center text-sm text-green-600">Check your email!</p>
        </Show>
      </div>
      <form
        action={submitForgotPassword}
        method="post"
        class="mx-auto mt-6 max-w-md space-y-6"
      >
        <LabeledInput name="email" label="Email" type="email" />
        <Turnstile class="flex justify-center" />
        <Button type="submit" class="w-full" disabled={submission.pending}>
          Request Password Reset
        </Button>
      </form>
    </>
  );
}
