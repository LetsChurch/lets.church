import { A, useLocation } from 'solid-start';
import { createServerAction$, redirect } from 'solid-start/server';
import { z } from 'zod';
import type {
  LoginMutation,
  LoginMutationVariables,
} from './__generated__/login';
import { gql, client } from '~/util/gql/server';
import { storage } from '~/util/session';
import { Button, LabeledInput } from '~/components/form';
import { Turnstile } from '~/components/turnstile';
import validateTurnstile from '~/util/server/validate-turnstile';

const LoginSchema = z.object({
  id: z.string(),
  password: z.string(),
  redirect: z.string(),
});

export default function LoginRoute() {
  const [loggingIn, { Form }] = createServerAction$(async (form: FormData) => {
    await validateTurnstile(form);

    const {
      id,
      password,
      redirect: to,
    } = LoginSchema.parse(
      Object.fromEntries(
        ['id', 'password', 'redirect'].map((p) => [p, form.get(p)]),
      ),
    );

    const data = await client.request<LoginMutation, LoginMutationVariables>(
      gql`
        mutation Login($id: String!, $password: String!) {
          login(id: $id, password: $password)
        }
      `,
      { id, password },
    );

    const session = await storage.getSession();
    session.set('jwt', data.login);

    const redirectTo = to.startsWith('/auth') ? '/' : to;

    return redirect(redirectTo, {
      headers: { 'Set-Cookie': await storage.commitSession(session) },
    });
  });

  const loc = useLocation();

  return (
    <>
      <div class="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 class="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Sign in to your account
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600">
          Or{' '}
          <A
            href="../register"
            class="font-medium text-indigo-600 hover:text-indigo-500"
          >
            register for a new account
          </A>
        </p>
      </div>
      <Form class="mx-auto max-w-md space-y-6">
        <input
          type="hidden"
          name="redirect"
          value={loc.query['redirect'] ?? '/'}
        />
        <LabeledInput name="id" label="Username or Email" />
        <LabeledInput name="password" label="Password" type="password" />
        <Turnstile class="flex justify-center" />
        <Button type="submit" class="w-full" disabled={loggingIn.pending}>
          Login
        </Button>
      </Form>
    </>
  );
}
