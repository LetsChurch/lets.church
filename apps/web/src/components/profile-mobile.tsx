import { For, Show } from 'solid-js';
import { A } from 'solid-start';
import BellIcon from '@tabler/icons/bell.svg?component-solid';
import type { MeQuery } from '~/routes/__generated__/(root)';
import { createServerAction$ } from 'solid-start/server';
import logoutAction from '~/util/logout-action';
import { profileLinks } from './profile';

export type Props = MeQuery;

export default function ProfileMobile(props: Props) {
  const [loggingOut, { Form }] = createServerAction$(logoutAction);

  return (
    <div class="border-t border-gray-200 pt-4 pb-3">
      <Show
        when={props.me}
        fallback={
          <A
            href="/auth/login"
            class="block px-4 py-2 text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            Login
          </A>
        }
      >
        <div class="flex items-center px-4">
          <div class="flex-shrink-0">
            <img
              class="h-10 w-10 rounded-full"
              src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
              alt=""
            />
          </div>
          <div class="ml-3">
            <div class="text-base font-medium text-gray-800">Tom Cook</div>
            <div class="text-sm font-medium text-gray-500">tom@example.com</div>
          </div>
          <button
            type="button"
            class="ml-auto flex-shrink-0 rounded-full bg-white p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <span class="sr-only">View notifications</span>
            <BellIcon class="h-6 w-6" />
          </button>
        </div>
        <div class="mt-3 space-y-1">
          <For each={profileLinks}>
            {(link) => (
              <A
                href={link.href}
                class="block px-4 py-2 text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                activeClass="bg-gray-100 text-gray-800"
              >
                {link.label}
              </A>
            )}
          </For>
          <Form>
            <button
              type="submit"
              class="block w-full px-4 py-2 text-start text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              disabled={loggingOut.pending}
            >
              Logout
            </button>
          </Form>
        </div>
      </Show>
    </div>
  );
}
