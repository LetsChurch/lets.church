import { z } from 'zod';
import { Show } from 'solid-js';
import { gql } from 'graphql-request';
import { action, redirect, useSubmission } from '@solidjs/router';
import invariant from 'tiny-invariant';
import type {
  LoginAfterRegisterMutation,
  LoginAfterRegisterMutationVariables,
  RegisterMutation,
  RegisterMutationVariables,
} from './__generated__/register';
import { Button, LabeledCheckbox, LabeledInput } from '~/components/form';
import { Turnstile } from '~/components/turnstile';
import validateTurnstile from '~/util/server/validate-turnstile';
import A from '~/components/content/a';
import { getAuthenticatedClient } from '~/util/gql/server';
import { setSessionJwt } from '~/util/session';

const RegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20),
  password: z.string(),
  fullName: z.string().max(100).optional(),
  agreeToTerms: z.preprocess((input) => input === 'on', z.literal(true)),
  agreeToTheology: z.preprocess((input) => input === 'on', z.literal(true)),
  subscribeToNewsletter: z.preprocess((input) => input === 'on', z.boolean()),
});

const register = action(async (form: FormData) => {
  'use server';
  await validateTurnstile(form);
  const client = await getAuthenticatedClient();

  const parseRes = RegisterSchema.safeParse(
    Object.fromEntries(
      [
        'email',
        'username',
        'password',
        'fullName',
        'agreeToTerms',
        'agreeToTheology',
        'subscribeToNewsletter',
      ].map((p) => [p, form.get(p)]),
    ),
  );

  if (!parseRes.success) {
    const { error } = parseRes;
    return { error: { fieldErrors: error.formErrors.fieldErrors } };
  }

  const {
    email,
    username,
    password,
    agreeToTerms,
    agreeToTheology,
    subscribeToNewsletter,
  } = parseRes.data;

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
        $agreeToTheology: Boolean!
        $subscribeToNewsletter: Boolean
      ) {
        register(
          email: $email
          username: $username
          password: $password
          fullName: $fullName
          agreeToTerms: $agreeToTerms
          agreeToTheology: $agreeToTheology
          subscribeToNewsletter: $subscribeToNewsletter
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
    {
      email,
      username,
      password,
      agreeToTerms,
      agreeToTheology,
      subscribeToNewsletter,
    },
  );

  if (registerRes.__typename === 'ValidationError') {
    return {
      error: {
        fieldErrors: registerRes.fieldErrors.reduce(
          (acc, cur) => ({ ...acc, [cur.path.at(-1) ?? '']: cur.message }),
          {} as Record<string, Array<string> | string>,
        ),
      },
    };
  }

  if (registerRes.__typename === 'DataError') {
    return { error: { formError: registerRes.error.message } };
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

  invariant(data.login, 'Expected login to be defined');
  await setSessionJwt(data.login);

  throw redirect('/');
});

export default function RegisterRoute() {
  const submission = useSubmission(register);

  return (
    <form
      action={register}
      method="post"
      class="space-y-6 sm:mx-auto sm:w-full sm:max-w-md"
    >
      <h2 class="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
        Register for an Account
      </h2>
      <Show when={submission.result?.error?.formError}>
        <p role="alert" class="text-sm font-bold text-red-600">
          {submission.result?.error?.formError}
        </p>
      </Show>
      <LabeledInput
        name="email"
        label="Email"
        type="email"
        error={submission.result?.error?.fieldErrors?.email}
      />
      <LabeledInput
        name="username"
        label="Username"
        error={submission.result?.error?.fieldErrors?.username}
      />
      <LabeledInput
        name="password"
        label="Password"
        type="password"
        error={submission.result?.error?.fieldErrors?.password}
      />
      <LabeledInput
        name="fullName"
        label="Full Name"
        error={submission.result?.error?.fieldErrors?.fullName}
      />
      <div class="space-y-0">
        <LabeledCheckbox
          name="agreeToTheology"
          label={
            <>
              I agree to the{' '}
              <A href="/about/theology">Let's Church Statement of Theology</A>.
            </>
          }
          error={
            submission.result?.error?.fieldErrors?.agreeToTheology
              ? 'You must agree to the Statement of Theology.'
              : null
          }
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
            submission.result?.error?.fieldErrors?.agreeToTerms
              ? 'You must agree to the terms and conditions.'
              : null
          }
        />
        <LabeledCheckbox
          name="subscribeToNewsletter"
          label="Subscribe to the Let's Church Newsletter."
          checked
        />
      </div>
      <Turnstile class="flex justify-center" />
      <Button type="submit" class="w-full" disabled={submission.pending}>
        Register
      </Button>
    </form>
  );
}
