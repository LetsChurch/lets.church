import {
  createEffect,
  createSignal,
  For,
  Show,
  type ComponentProps,
} from 'solid-js';
// import BellIcon from '@tabler/icons/outline/bell.svg?component-solid';
import MenuIcon from '@tabler/icons/outline/menu-2.svg?component-solid';
import XIcon from '@tabler/icons/outline/x.svg?component-solid';
import { A, useBeforeLeave, useIsRouting } from '@solidjs/router';
import Profile from './profile';
import ProfileMobile from './profile-mobile';
import Logo from './logo';
import { useUser } from '~/util/user-context';

const navLinks: Array<ComponentProps<typeof A>> = [
  { href: '/', children: 'Media', end: true },
  { href: '/churches', children: 'Find a Church' },
  { href: '/about', children: 'About' },
];

function DonateButton() {
  return (
    <a
      href="https://www.zeffy.com/en-US/donation-form/5da9e1c3-a8e2-4bb4-817a-5dbbb968ec6b"
      target="_blank"
      class="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
    >
      Donate
    </a>
  );
}

export default function Header() {
  const user = useUser();
  const [showMobileMenu, setShowMobileMenu] = createSignal(false);

  function toggleMobileMenu() {
    setShowMobileMenu((show) => !show);
  }

  function closeMobileMenu() {
    setShowMobileMenu(false);
  }

  useBeforeLeave(() => {
    closeMobileMenu();
  });

  const isRouting = useIsRouting();

  createEffect(() => {
    if (isRouting()) {
      closeMobileMenu();
    }
  });

  return (
    <header class="bg-white shadow">
      <nav>
        <div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-8">
          <div class="flex h-16 justify-between">
            <div class="flex px-2 lg:px-0">
              <div class="flex flex-shrink-0 items-center">
                <A href="/" title="Let's Church Home">
                  <Logo class="text-indigo-500" width="100" />
                </A>
              </div>
              <div class="hidden lg:ml-6 lg:flex lg:space-x-8">
                <For each={navLinks}>
                  {(props) => (
                    <A
                      class="inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium"
                      inactiveClass="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                      activeClass="border-indigo-500 text-gray-900"
                      {...props}
                    >
                      {props.children}
                    </A>
                  )}
                </For>
              </div>
            </div>
            <div class="flex items-center lg:hidden">
              <DonateButton />
              <button
                type="button"
                class="relative inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                aria-controls="mobile-menu"
                aria-expanded="false"
                onClick={toggleMobileMenu}
              >
                <span class="sr-only">Open main menu</span>
                <Show when={showMobileMenu()} fallback={<MenuIcon />}>
                  <XIcon />
                </Show>
              </button>
            </div>
            <div class="hidden lg:ml-4 lg:flex lg:items-center">
              <DonateButton />
              <Profile me={user()} />
            </div>
          </div>
        </div>

        <Show when={showMobileMenu()}>
          <div class="lg:hidden" id="mobile-menu">
            <div class="space-y-1 pb-3 pt-2">
              <For each={navLinks}>
                {(props) => (
                  <A
                    class="block border-l-4 py-2 pl-3 pr-4 text-base font-medium"
                    inactiveClass="border-transparent text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800"
                    activeClass="border-indigo-500 bg-indigo-50 text-indigo-700"
                    {...props}
                  >
                    {props.children}
                  </A>
                )}
              </For>
            </div>
            <ProfileMobile me={user()} />
          </div>
        </Show>
      </nav>
    </header>
  );
}
