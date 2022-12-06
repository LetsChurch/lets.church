import { createUniqueId, mergeProps } from 'solid-js';
import { createServerAction$, redirect } from 'solid-start/server';
import * as Z from 'zod';
import { gql, client } from '~/util/gql/server';
import { storage } from '~/util/session';
import type {
  LoginMutation,
  LoginMutationVariables,
} from './__generated__/login';

const LoginSchema = Z.object({
  id: Z.string(),
  password: Z.string(),
});

function Input(props: { name: string; label: string; type?: string }) {
  const merged = mergeProps({ type: 'text' }, props);
  const id = createUniqueId();

  return (
    <div>
      <label for={id} class="block text-sm font-medium text-gray-700">
        {merged.label}
      </label>
      <input
        id={id}
        name={merged.name}
        type={merged.type}
        placeholder={merged.label}
        class="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
      />
    </div>
  );
}

export default function LoginRoute() {
  const [loggingIn, { Form }] = createServerAction$(async (form: FormData) => {
    const { id, password } = LoginSchema.parse(
      Object.fromEntries(['id', 'password'].map((p) => [p, form.get(p)])),
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

    return redirect('/', {
      headers: { 'Set-Cookie': await storage.commitSession(session) },
    });
  });

  return (
    <Form class="mx-auto max-w-md space-y-6">
      <Input name="id" label="Username or Email" />
      <Input name="password" label="Password" type="password" />
      <button
        type="submit"
        class="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        disabled={loggingIn.pending}
      >
        Login
      </button>
    </Form>
  );
}
