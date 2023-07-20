import { createEffect, createSignal, createUniqueId, Show } from 'solid-js';
import { A } from 'solid-start';
import { useFloating } from 'solid-floating-ui';
import { useBeforeLeave, useIsRouting } from '@solidjs/router';
import { createServerAction$ } from 'solid-start/server';
import FloatingMenu from './floating-menu';
import { Avatar } from './avatar';
import logoutAction from '~/util/logout-action';
import { useLoginLocation, useSerializedLocation } from '~/util';
import type { MeQuery } from '~/routes/__generated__/(root)';

export const profileLinks = [{ href: '/profile', label: 'Your Profile' }];

export type Props = MeQuery;

export default function Profile(props: Props) {
  const logoutFormId = createUniqueId();
  const [showMenu, setShowMenu] = createSignal(false);
  const [reference, setReference] = createSignal<HTMLDivElement>();
  const [floating, setFloating] = createSignal<HTMLDivElement>();
  const position = useFloating(reference, floating, {
    placement: 'bottom-end',
  });

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
  const loginLocation = useLoginLocation();

  return (
    <div class="relative ml-4 flex-shrink-0">
      <div>
        <Show
          when={props.me}
          fallback={
            <A
              href={loginLocation}
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
            <Avatar src={props.me?.avatarUrl ?? ''} size="sm" />
          </button>
          <Form id={logoutFormId} class="hidden" onSubmit={() => closeMenu()}>
            <input
              type="hidden"
              name="redirect"
              value={useSerializedLocation()}
            />
          </Form>
        </Show>
      </div>
      <FloatingMenu
        ref={setFloating}
        open={showMenu()}
        position={position}
        aria-labelledby={menuButtonId}
        onClose={closeMenu}
        links={[
          ...(props.me?.canUpload
            ? [{ href: '/upload', label: 'Upload' }]
            : []),
          ...profileLinks,
          { label: 'Logout', form: logoutFormId, pending: loggingOut.pending },
        ]}
        class="mt-2 w-48"
      />
    </div>
  );
}
