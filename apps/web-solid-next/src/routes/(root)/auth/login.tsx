import { z } from 'zod';
import { gql } from 'graphql-request';
import { action, redirect, useLocation, useSubmission } from '@solidjs/router';
import invariant from 'tiny-invariant';
import type {
  LoginMutation,
  LoginMutationVariables,
} from './__generated__/login';
import { Button, LabeledInput } from '~/components/form';
import { Turnstile } from '~/components/turnstile';
import validateTurnstile from '~/util/server/validate-turnstile';
import { getAuthenticatedClient } from '~/util/gql/server';
import { setSessionJwt } from '~/util/session';

const LoginSchema = z.object({
  id: z.string(),
  password: z.string(),
  redirect: z.string(),
});

const login = action(async (form: FormData) => {
  'use server';
  await validateTurnstile(form);
  const client = await getAuthenticatedClient();

  const {
    id,
    password,
    redirect: to,
  } = LoginSchema.parse(
    Object.fromEntries(
      ['id', 'password', 'redirect'].map((p) => [p, form.get(p)]),
    ),
  );

  const { login: jwt } = await client.request<
    LoginMutation,
    LoginMutationVariables
  >(
    gql`
      mutation Login($id: String!, $password: String!) {
        login(id: $id, password: $password)
      }
    `,
    { id, password },
  );

  invariant(jwt, 'Expected login to be defined');
  await setSessionJwt(jwt);

  const redirectTo = to.startsWith('/auth') ? '/' : to;

  throw redirect(redirectTo);
});

export default function LoginRoute() {
  const loc = useLocation();
  const submission = useSubmission(login);

  return (
    <>
      <div class="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 class="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Sign in to your account
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600">
          Or{' '}
          <a
            href="/auth/register"
            class="font-medium text-indigo-600 hover:text-indigo-500"
          >
            register for a new account
          </a>
        </p>
      </div>
      <form action={login} method="post" class="mx-auto max-w-md space-y-6">
        <input
          type="hidden"
          name="redirect"
          value={loc.query['redirect'] ?? '/'}
        />
        <LabeledInput name="id" label="Username or Email" />
        <LabeledInput name="password" label="Password" type="password" />
        <Turnstile class="flex justify-center" />
        <Button type="submit" class="w-full" disabled={submission.pending}>
          Login
        </Button>
        <p class="text-center text-xs">
          <a
            href="../forgot-password"
            class="text-xs text-gray-500 hover:text-gray-900"
          >
            Forgot your password?
          </a>
        </p>
      </form>
    </>
  );
}
