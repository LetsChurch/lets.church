import { A } from 'solid-start';
import { createServerAction$, redirect } from 'solid-start/server';
import { For } from 'solid-js';
import { Button, Input } from './form';
import { Turnstile } from './turnstile';
import { useUser } from '~/util/user-context';
import validateTurnstile from '~/util/server/validate-turnstile';

export default function Newsletter(props: { listIds: Array<string> }) {
  const [submitting, { Form }] = createServerAction$(async (form: FormData) => {
    await validateTurnstile(form);
    await fetch(
      import.meta.env['VITE_LISTMONK_INTERNAL_URL'] + '/subscription/form',
      { method: 'POST', body: form },
    );

    return redirect('/newsletter/subscribe');
  });

  const user = useUser();
  const email = () => user()?.emails.at(0)?.email ?? '';

  return (
    <div class="bg-white py-16 sm:py-24 lg:py-32">
      <div class="mx-auto mt-5 grid grid-cols-1 gap-10 px-6 lg:grid-cols-12 lg:gap-8 lg:px-8">
        <div class="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl lg:col-span-7">
          <h2>Want updates about Let's Church?</h2>
          <p>Sign up for our newsletter.</p>
        </div>
        <Form class="w-full max-w-md space-y-4 lg:col-span-5 lg:pt-2">
          <div class="flex gap-x-4">
            <label for="email-address" class="sr-only">
              Email address
            </label>
            <Input
              name="email"
              type="email"
              autocomplete="email"
              required
              placeholder="Enter your email"
              value={email()}
            />
            <For each={props.listIds}>
              {(id) => <input type="hidden" name="l" value={id} />}
            </For>
            <Button type="submit" disabled={submitting.pending}>
              Subscribe
            </Button>
          </div>
          <p class="text-sm leading-6 text-gray-900">
            No spam. Read our{' '}
            <A
              href="/about/privacy"
              class="font-semibold text-indigo-600 hover:text-indigo-500"
            >
              privacy&nbsp;policy
            </A>
            .
          </p>
          <Turnstile />
        </Form>
      </div>
    </div>
  );
}
