import { For, Show } from 'solid-js';
// import BellIcon from '@tabler/icons/bell.svg?component-solid';
import { A, useSubmission } from '@solidjs/router';
import { profileLinks } from './profile';
import { Avatar } from './avatar';
import type { MeQuery } from '~/routes/__generated__/(root)';
import logoutAction from '~/util/logout-action';
import { useLoginLocation, useSerializedLocation } from '~/util';

export type Props = MeQuery;

export default function ProfileMobile(props: Props) {
  const loginLocation = useLoginLocation();
  const logoutSubmission = useSubmission(logoutAction);

  return (
    <div class="border-t border-gray-200 pb-3 pt-4">
      <Show
        when={props.me}
        fallback={
          <A
            href={loginLocation}
            class="block px-4 py-2 text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            Login
          </A>
        }
      >
        <div class="flex items-center px-4">
          <div class="flex-shrink-0">
            <Avatar src={props.me?.avatarUrl ?? ''} size="md" />
          </div>
          <div class="ml-3">
            <div class="text-base font-medium text-gray-800">
              {props.me?.username}
            </div>
            <div class="text-sm font-medium text-gray-500">
              {props.me?.fullName}
            </div>
          </div>
          {/* <button */}
          {/*   type="button" */}
          {/*   class="ml-auto flex-shrink-0 rounded-full bg-white p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2" */}
          {/* > */}
          {/*   <span class="sr-only">View notifications</span> */}
          {/*   <BellIcon /> */}
          {/* </button> */}
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
          <form action={logoutAction} method="post">
            <input
              type="hidden"
              name="redirect"
              value={useSerializedLocation()}
            />
            <button
              type="submit"
              class="block w-full px-4 py-2 text-start text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              disabled={logoutSubmission.pending}
            >
              Logout
            </button>
          </form>
        </div>
      </Show>
    </div>
  );
}
