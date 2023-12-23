import { createSignal, createUniqueId } from 'solid-js';
import { useFloating } from 'solid-floating-ui';
import type { MeQuery } from '../queries/auth';
import { AppUserRole } from '../__generated__/graphql-types';
import FloatingMenu from './floating-menu';
import Avatar from './avatar';

export const profileLinks = [{ href: '/profile', label: 'Your Profile' }];

export type Props = MeQuery;

export default function Profile(props: Props) {
  const logoutFormId = createUniqueId();
  const [showMenu, setShowMenu] = createSignal(false);
  const [reference, setReference] = createSignal<HTMLDivElement>();
  const [floating, setFloating] = createSignal<HTMLDivElement>();
  const position = useFloating(reference, floating, {
    placement: 'top-start',
  });

  function toggleMenu() {
    setShowMenu((show) => !show);
  }

  function closeMenu() {
    setShowMenu(false);
  }

  const menuButtonId = createUniqueId();

  return (
    <>
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
        class="hidden"
        action="/auth/logout"
        method="post"
      >
        <input type="hidden" name="redirect" />
      </form>
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
          { label: 'Logout', form: logoutFormId },
        ]}
        class="translate-x-10 translate-y-5"
      />
    </>
  );
}
