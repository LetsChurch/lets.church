import { createServerAction$, redirect } from 'solid-start/server';
import * as Z from 'zod';
import { FormError } from 'solid-start';
import { createEffect, Show } from 'solid-js';
import type {
  LoginAfterRegisterMutation,
  LoginAfterRegisterMutationVariables,
  RegisterMutation,
  RegisterMutationVariables,
} from './__generated__/register';
import { gql, client } from '~/util/gql/server';
import { storage } from '~/util/session';
import { Button, LabeledCheckbox, LabeledInput } from '~/components/form';
import { Turnstile } from '~/components/turnstile';
import validateTurnstile from '~/util/server/validate-turnstile';
import A from '~/components/content/a';

const LoginSchema = Z.object({
  email: Z.string().email(),
  username: Z.string().min(3).max(20),
  password: Z.string(),
  fullName: Z.string().max(100).optional(),
  agreeToTerms: Z.preprocess((input) => input === 'on', Z.literal(true)),
});

export default function RegisterRoute() {
  const [registering, { Form }] = createServerAction$(
    async (form: FormData) => {
      await validateTurnstile(form);

      const parseRes = LoginSchema.safeParse(
        Object.fromEntries(
          ['email', 'username', 'password', 'fullName', 'agreeToTerms'].map(
            (p) => [p, form.get(p)],
          ),
        ),
      );

      if (!parseRes.success) {
        const { error } = parseRes;
        throw new FormError('', {
          fieldErrors: error.formErrors.fieldErrors,
        });
      }

      const { email, username, password, agreeToTerms } = parseRes.data;

      const { register: registerRes } = await client.request<
        RegisterMutation,
        RegisterMutationVariables
      >(
        gql`
          mutation Register(
            $email: String!
            $username: String!
            $password: String!
            $fullName: String
            $agreeToTerms: Boolean!
          ) {
            register(
              email: $email
              username: $username
              password: $password
              fullName: $fullName
              agreeToTerms: $agreeToTerms
            ) {
              __typename
              ... on ValidationError {
                fieldErrors {
                  path
                  message
                }
              }
              ... on DataError {
                error {
                  message
                }
              }
              ... on MutationRegisterSuccess {
                data {
                  id
                }
              }
            }
          }
        `,
        { email, username, password, agreeToTerms },
      );

      if (registerRes.__typename === 'ValidationError') {
        throw new FormError('', { fieldErrors: registerRes.fieldErrors });
      }

      if (registerRes.__typename === 'DataError') {
        throw new FormError(registerRes.error.message);
      }

      const data = await client.request<
        LoginAfterRegisterMutation,
        LoginAfterRegisterMutationVariables
      >(
        gql`
          mutation LoginAfterRegister($id: String!, $password: String!) {
            login(id: $id, password: $password)
          }
        `,
        { id: username, password },
      );

      const session = await storage.getSession();
      session.set('jwt', data.login);

      return redirect('/', {
        headers: { 'Set-Cookie': await storage.commitSession(session) },
      });
    },
  );

  createEffect(() => {
    console.dir(registering.error);
  });

  return (
    <Form class="space-y-6 sm:mx-auto sm:w-full sm:max-w-md">
      <h2 class="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
        Register for an Account
      </h2>
      <Show when={registering.error?.formError}>
        <p role="alert" class="text-sm font-bold text-red-600">
          {registering.error?.formError}
        </p>
      </Show>
      <LabeledInput
        name="email"
        label="Email"
        type="email"
        error={registering.error?.fieldErrors?.email}
      />
      <LabeledInput
        name="username"
        label="Username"
        error={registering.error?.fieldErrors?.username}
      />
      <LabeledInput
        name="password"
        label="Password"
        type="password"
        error={registering.error?.fieldErrors?.password}
      />
      <LabeledInput
        name="fullName"
        label="Full Name"
        error={registering.error?.fieldErrors?.fullName}
      />
      <LabeledCheckbox
        name="agreeToTerms"
        label={
          <>
            I agree to the <A href="/about/terms">Terms and Conditions</A> and{' '}
            <A href="/about/privacy">Privacy Policy</A>.
          </>
        }
        error={
          registering.error?.fieldErrors?.agreeToTerms
            ? 'You must agree to the terms and conditions.'
            : null
        }
      />
      <Turnstile class="flex justify-center" />
      <Button type="submit" class="w-full" disabled={registering.pending}>
        Register
      </Button>
    </Form>
  );
}
