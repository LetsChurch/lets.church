import { A, FormError } from 'solid-start';
import { createServerAction$, redirect } from 'solid-start/server';
import invariant from 'tiny-invariant';
import { Button } from './form';
import type {
  SubscribeToNewsletterMutation,
  SubscribeToNewsletterMutationVariables,
} from './__generated__/newsletter';
import { gql, client } from '~/util/gql/server';
import { useUser } from '~/util/user-context';

export default function Newsletter() {
  const [submitting, { Form }] = createServerAction$(async (form: FormData) => {
    const email = form.get('email')?.toString();
    invariant(email);

    const { subscribeToNewsletter: res } = await client.request<
      SubscribeToNewsletterMutation,
      SubscribeToNewsletterMutationVariables
    >(
      gql`
        mutation SubscribeToNewsletter($email: String!) {
          subscribeToNewsletter(email: $email) {
            ... on MutationSubscribeToNewsletterSuccess {
              __typename
              data
            }
            ... on ValidationError {
              __typename
              fieldErrors {
                message
                path
              }
            }
          }
        }
      `,
      { email },
    );

    if (res.__typename === 'ValidationError') {
      throw new FormError('', {
        fieldErrors: res.fieldErrors.reduce(
          (acc, cur) => ({ ...acc, [cur.path.at(-1) ?? '']: cur.message }),
          {} as Record<string, Array<string> | string>,
        ),
      });
    }

    return redirect('/');
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
        <Form class="w-full max-w-md lg:col-span-5 lg:pt-2">
          <div class="flex gap-x-4">
            <label for="email-address" class="sr-only">
              Email address
            </label>
            <input
              name="email"
              type="email"
              autocomplete="email"
              required
              class="min-w-0 flex-auto rounded-md border-0 px-3.5 py-2 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              placeholder="Enter your email"
              value={email()}
            />
            <Button type="submit" disabled={submitting.pending}>
              Subscribe
            </Button>
          </div>
          <p class="mt-4 text-sm leading-6 text-gray-900">
            No spam. Read our{' '}
            <A
              href="/about/privacy"
              class="font-semibold text-indigo-600 hover:text-indigo-500"
            >
              privacy&nbsp;policy
            </A>
            .
          </p>
        </Form>
      </div>
    </div>
  );
}
