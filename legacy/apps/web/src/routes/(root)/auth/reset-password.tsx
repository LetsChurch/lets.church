import { gql } from 'graphql-request';
import { RouteDataArgs, useRouteData } from 'solid-start';
import {
  createServerAction$,
  createServerData$,
  redirect,
} from 'solid-start/server';
import * as z from 'zod';
import {
  ResetPasswordMutation,
  ResetPasswordMutationVariables,
} from './__generated__/reset-password';
import { Button, LabeledInput } from '~/components/form';
import { Turnstile } from '~/components/turnstile';
import validateTurnstile from '~/util/server/validate-turnstile';
import { createAuthenticatedClient } from '~/util/gql/server';

const ResetPasswordSchema = z.object({
  id: z.string().uuid(),
  password: z.string(),
});

export function routeData({ location }: RouteDataArgs) {
  return createServerData$(
    ([id = null]) => {
      if (!id) {
        throw redirect('/');
      }

      return id;
    },
    { key: () => [location.query['id']] },
  );
}

export default function ResetPasswordRoute() {
  const data = useRouteData<typeof routeData>();

  const [submitting, { Form }] = createServerAction$(
    async (form: FormData, { request }) => {
      const client = await createAuthenticatedClient(request);
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

      return redirect('/auth/login');
    },
  );

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
      <Form class="mx-auto mt-6 max-w-md space-y-6">
        <input type="hidden" name="id" value={data() ?? ''} />
        <LabeledInput name="password" label="New Password" type="password" />
        <Turnstile class="flex justify-center" />
        <Button type="submit" class="w-full" disabled={submitting.pending}>
          Reset Password
        </Button>
      </Form>
    </>
  );
}
