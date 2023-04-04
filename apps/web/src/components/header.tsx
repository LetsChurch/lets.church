import { A, useLocation, useNavigate } from 'solid-start';
import {
  createEffect,
  createSignal,
  createUniqueId,
  ParentProps,
  Show,
  useContext,
} from 'solid-js';
import SearchIcon from '@tabler/icons/search.svg?component-solid';
import BellIcon from '@tabler/icons/bell.svg?component-solid';
import MenuIcon from '@tabler/icons/menu-2.svg?component-solid';
import XIcon from '@tabler/icons/x.svg?component-solid';
import { useBeforeLeave, useIsRouting } from '@solidjs/router';
import Profile from './profile';
import ProfileMobile from './profile-mobile';
import { UserContext } from '~/routes/(root)';

type NavLinkProps = ParentProps<{ href: string; active?: boolean }>;

function NavLink(props: NavLinkProps) {
  return (
    <A
      href={props.href}
      class={`inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium  ${
        props.active
          ? 'border-indigo-500 text-gray-900'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
      }`}
    >
      {props.children}
    </A>
  );
}

function NavLinkMobile(props: NavLinkProps) {
  return (
    <A
      href={props.href}
      class={`block border-l-4 py-2 pl-3 pr-4 text-base font-medium ${
        props.active
          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
          : 'border-transparent text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800'
      }`}
    >
      {props.children}
    </A>
  );
}

export default function Header() {
  const user = useContext(UserContext);
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

  const searchId = createUniqueId();
  const navigate = useNavigate();
  const loc = useLocation();

  function onSearch(e: SubmitEvent) {
    e.preventDefault();
    const search = (e.target as HTMLFormElement)
      ?.elements[0] as HTMLInputElement;
    const params = new URLSearchParams({ q: search.value });
    navigate(`/search?${params.toString()}`);
  }

  function defaultSearch() {
    const params = new URLSearchParams(loc.search);
    return params.get('q') ?? '';
  }

  return (
    <header>
      <nav class="bg-white shadow">
        <div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-8">
          <div class="flex h-16 justify-between">
            <div class="flex px-2 lg:px-0">
              <div class="flex flex-shrink-0 items-center text-4xl">
                <A href="/">✝️</A>
              </div>
              <div class="hidden lg:ml-6 lg:flex lg:space-x-8">
                <NavLink href="/" active>
                  Watch
                </NavLink>
                <NavLink href="#">Listen</NavLink>
                <NavLink href="#">Read</NavLink>
                <NavLink href="#">About</NavLink>
              </div>
            </div>
            <div class="flex flex-1 items-center justify-center px-2 lg:ml-6 lg:justify-end">
              <div class="w-full max-w-lg lg:max-w-xs">
                <label for={searchId} class="sr-only">
                  Search
                </label>
                <div class="relative">
                  <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <SearchIcon class="h-5 w-5 text-gray-400" />
                  </div>
                  <form method="get" action="/search" onSubmit={onSearch}>
                    <input
                      id={searchId}
                      name="q"
                      class="block w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 leading-5 placeholder-gray-500 focus:border-indigo-500 focus:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                      placeholder="Search"
                      type="search"
                      value={defaultSearch()}
                    />
                  </form>
                </div>
              </div>
            </div>
            <div class="flex items-center lg:hidden">
              <button
                type="button"
                class="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                aria-controls="mobile-menu"
                aria-expanded="false"
                onClick={toggleMobileMenu}
              >
                <span class="sr-only">Open main menu</span>
                <Show
                  when={showMobileMenu()}
                  fallback={<MenuIcon class="block h-6 w-6" />}
                >
                  <XIcon class="block h-6 w-6" />
                </Show>
              </button>
            </div>
            <div class="hidden lg:ml-4 lg:flex lg:items-center">
              <button
                type="button"
                class="flex-shrink-0 rounded-full bg-white p-1 text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                <span class="sr-only">View notifications</span>
                <BellIcon class="h-6 w-6" />
              </button>
              <Profile me={user?.()?.me ?? null} />
            </div>
          </div>
        </div>

        <Show when={showMobileMenu()}>
          <div class="lg:hidden" id="mobile-menu">
            <div class="space-y-1 pb-3 pt-2">
              <NavLinkMobile href="#" active>
                Watch
              </NavLinkMobile>
              <NavLinkMobile href="#">Listen</NavLinkMobile>
              <NavLinkMobile href="#">Read</NavLinkMobile>
              <NavLinkMobile href="#">About</NavLinkMobile>
            </div>
            <ProfileMobile me={user?.()?.me ?? null} />
          </div>
        </Show>
      </nav>
    </header>
  );
}
