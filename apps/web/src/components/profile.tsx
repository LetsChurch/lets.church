import {
  createEffect,
  createSignal,
  createUniqueId,
  For,
  Show,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { A, useLocation } from 'solid-start';
import { useFloating } from 'solid-floating-ui';
import clickOutside from '~/util/click-outside';
import type { MeQuery } from '~/routes/__generated__/(root)';
import { useBeforeLeave, useIsRouting } from '@solidjs/router';
import ShowTransition from './show-transition';
import { createServerAction$ } from 'solid-start/server';
import logoutAction from '~/util/logout-action';

export const profileLinks = [
  { href: '/upload', label: 'Upload' },
  { href: '/profile', label: 'Your Profile' },
  { href: '/settings', label: 'Settings' },
];

export type Props = MeQuery;

export default function Profile(props: Props) {
  const logoutFormId = createUniqueId();
  const [showMenu, setShowMenu] = createSignal(false);
  const [reference, setReference] = createSignal<HTMLDivElement>();
  const [floating, setFloating] = createSignal<HTMLDivElement>();
  const position = useFloating(reference, floating, {
    placement: 'bottom-end',
  });
  const loc = useLocation();

  function toggleMenu() {
    setShowMenu((show) => !show);
  }

  function closeMenu() {
    setShowMenu(false);
  }

  useBeforeLeave(() => {
    closeMenu();
  });

  const isRouting = useIsRouting();

  createEffect(() => {
    if (isRouting()) {
      closeMenu();
    }
  });

  const [loggingOut, { Form }] = createServerAction$(logoutAction);

  const menuButtonId = createUniqueId();

  return (
    <div class="relative ml-4 flex-shrink-0">
      <div>
        <div>
          <Show
            when={props.me}
            fallback={
              <A
                href="/auth/login"
                class="ml-6 inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Login
              </A>
            }
          >
            <button
              type="button"
              class="flex rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              id={menuButtonId}
              aria-expanded="false"
              aria-haspopup="true"
              ref={setReference}
              onClick={toggleMenu}
            >
              <span class="sr-only">Open user menu</span>
              <img
                class="h-8 w-8 rounded-full"
                src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                alt="User Icon"
              />
            </button>
            <Form
              id={logoutFormId}
              class="hidden"
              onSubmit={() => closeMenu()}
            />
          </Show>
        </div>
      </div>

      <ShowTransition
        when={showMenu()}
        classEnterBase="transition ease-out duration-100"
        classEnterFrom="transform opacity-0 scale-95"
        classEnterTo="transform opacity-100 scale-100"
        classExitBase="transition ease-in duration-75"
        classExitFrom="transform opacity-100 scale-100"
        classExitTo="transform opacity-0 scale-95"
      >
        {(tref) => (
          <Portal>
            <div
              class="z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
              role="menu"
              aria-orientation="vertical"
              aria-labelledby={menuButtonId}
              tabindex="-1"
              ref={(el) => {
                tref(el);
                setFloating(el);
                clickOutside(el, closeMenu);
              }}
              style={{
                position: position.strategy,
                top: `${position.y ?? 0}px`,
                left: `${position.x ?? 0}px`,
              }}
            >
              <For each={profileLinks}>
                {({ href, label }) => (
                  <A
                    href={href}
                    class="block px-4 py-2 text-sm text-gray-700"
                    class:bg-gray-100={loc.pathname === href}
                    role="menuitem"
                    tabindex="-1"
                  >
                    {label}
                  </A>
                )}
              </For>
              <button
                type="submit"
                class="block px-4 py-2 text-sm text-gray-700"
                disabled={loggingOut.pending}
                form={logoutFormId}
              >
                Logout
              </button>
            </div>
          </Portal>
        )}
      </ShowTransition>
    </div>
  );
}
