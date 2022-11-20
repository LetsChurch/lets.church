<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import SearchIcon from '@tabler/icons/search.svg?component';
  import BellIcon from '@tabler/icons/bell.svg?component';
  import MenuIcon from '@tabler/icons/menu-2.svg?component';
  import XIcon from '@tabler/icons/x.svg?component';
  import type { MeQuery } from '~/__generated__/graphql-types';

  import NavLink from './header/nav-link.svelte';
  import NavLinkMobile from './header/nav-link-mobile.svelte';
  import Profile from './header/profile.svelte';
  import ProfileMobile from './header/profile-mobile.svelte';

  export let me: MeQuery['me'];

  let showMobileMenu = false;

  function toggleMobileMenu() {
    showMobileMenu = !showMobileMenu;
  }

  afterNavigate(() => {
    showMobileMenu = false;
  });
</script>

<header>
  <nav class="bg-white shadow">
    <div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-8">
      <div class="flex h-16 justify-between">
        <div class="flex px-2 lg:px-0">
          <div class="flex flex-shrink-0 items-center text-4xl">
            <a href="/">✝️</a>
          </div>
          <div class="hidden lg:ml-6 lg:flex lg:space-x-8">
            <NavLink href="#" active>Watch</NavLink>
            <NavLink href="#">Listen</NavLink>
            <NavLink href="#">Read</NavLink>
            <NavLink href="#">About</NavLink>
          </div>
        </div>
        <div
          class="flex flex-1 items-center justify-center px-2 lg:ml-6 lg:justify-end"
        >
          <div class="w-full max-w-lg lg:max-w-xs">
            <label for="search" class="sr-only">Search</label>
            <div class="relative">
              <div
                class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"
              >
                <SearchIcon class="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="search"
                name="search"
                class="block w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-3 leading-5 placeholder-gray-500 focus:border-indigo-500 focus:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                placeholder="Search"
                type="search"
              />
            </div>
          </div>
        </div>
        <div class="flex items-center lg:hidden">
          <!-- Mobile menu button -->
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            aria-controls="mobile-menu"
            aria-expanded="false"
            on:click={toggleMobileMenu}
          >
            <span class="sr-only">Open main menu</span>
            {#if showMobileMenu}
              <XIcon class="block h-6 w-6" />
            {:else}
              <MenuIcon class="block h-6 w-6" />
            {/if}
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
          <Profile {me} />
        </div>
      </div>
    </div>

    <!-- Mobile menu, show/hide based on menu state. -->
    {#if showMobileMenu}
      <div class="lg:hidden" id="mobile-menu">
        <div class="space-y-1 pt-2 pb-3">
          <NavLinkMobile href="#" active>Watch</NavLinkMobile>
          <NavLinkMobile href="#">Listen</NavLinkMobile>
          <NavLinkMobile href="#">Read</NavLinkMobile>
          <NavLinkMobile href="#">About</NavLinkMobile>
        </div>
        <ProfileMobile {me} />
      </div>
    {/if}
  </nav>
</header>
