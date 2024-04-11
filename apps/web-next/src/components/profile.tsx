import { createEffect, createSignal, createUniqueId, Show } from 'solid-js';
import { useFloating } from 'solid-floating-ui';
import {
  A,
  useBeforeLeave,
  useIsRouting,
  useSubmission,
} from '@solidjs/router';
import FloatingMenu from './floating-menu';
import { Avatar } from './avatar';
import logoutAction from '~/util/logout-action';
import { useLoginLocation, useSerializedLocation } from '~/util';
import type { MeQuery } from '~/routes/__generated__/(root)';
import { AppUserRole } from '~/__generated__/graphql-types';

export const profileLinks = [{ href: '/profile', label: 'Your Profile' }];

export type Props = MeQuery;

export default function Profile(props: Props) {
  const logoutFormId = createUniqueId();
  const logoutSubmission = useSubmission(logoutAction);
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

  const menuButtonId = createUniqueId();
  const loginLocation = useLoginLocation();

  return (
    <div class="relative ml-4 flex-shrink-0">
      <Show
        when={props.me}
        fallback={
          <A
            href={loginLocation}
            class="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
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
        <form
          id={logoutFormId}
          action={logoutAction}
          method="post"
          class="hidden"
          onSubmit={() => closeMenu()}
        >
          <input
            type="hidden"
            name="redirect"
            value={useSerializedLocation()}
          />
        </form>
      </Show>
      <FloatingMenu
        ref={setFloating}
        open={showMenu()}
        position={position}
        aria-labelledby={menuButtonId}
        onClose={closeMenu}
        links={[
          ...(props.me?.role === AppUserRole.Admin
            ? [{ href: '/admin', label: 'Admin' }]
            : []),
          ...(props.me?.canUpload
            ? [{ href: '/upload', label: 'Upload' }]
            : []),
          ...profileLinks,
          {
            label: 'Logout',
            form: logoutFormId,
            pending: logoutSubmission.pending,
          },
        ]}
        class="mt-2 w-48"
      />
    </div>
  );
}
