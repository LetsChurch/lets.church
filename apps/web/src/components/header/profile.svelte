<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/stores';
  import { offset, flip, shift } from '@floating-ui/dom';
  import { createFloatingActions } from 'svelte-floating-ui';
  import tclasses from 'svelte-transition-classes';
  import { portal } from 'svelte-portal';
  import clickOutside from '~/util/click-outside';
  import type { MeQuery } from '~/__generated__/graphql-types';

  export let me: MeQuery['me'];

  const [floatingRef, floatingContent] = createFloatingActions({
    strategy: 'absolute',
    placement: 'top-end',
    middleware: [offset(6), flip(), shift()],
  });

  let showMenu = false;

  function toggleMenu() {
    showMenu = !showMenu;
  }

  function closeMenu() {
    showMenu = false;
  }

  export const profileLinks = [
    { href: '/upload', label: 'Upload' },
    { href: '#', label: 'Your Profile' },
    { href: '#', label: 'Settings' },
  ];
</script>

<div class="relative ml-4 flex-shrink-0">
  <div>
    <div>
      {#if me}
        <button
          type="button"
          class="flex rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          id="user-menu-button"
          aria-expanded="false"
          aria-haspopup="true"
          use:floatingRef
          on:click={toggleMenu}
        >
          <span class="sr-only">Open user menu</span>
          <img
            class="h-8 w-8 rounded-full"
            src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
            alt=""
          />
        </button>
      {:else}
        <a
          href="/auth/login"
          class="ml-6 inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          Login
        </a>
      {/if}
    </div>
  </div>

  {#if showMenu}
    <div
      class="z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
      role="menu"
      aria-orientation="vertical"
      aria-labelledby="user-menu-button"
      tabindex="-1"
      use:floatingContent
      use:clickOutside={closeMenu}
      in:tclasses={{
        duration: 100,
        base: 'transition ease-out duration-100',
        from: 'transform opacity-0 scale-95',
        to: 'transform opacity-100 scale-100',
      }}
      out:tclasses={{
        duration: 75,
        base: 'transition ease-in duration-75',
        from: 'transform opacity-100 scale-100',
        to: 'transform opacity-0 scale-95',
      }}
      use:portal={'body'}
    >
      {#each profileLinks as { href, label }}
        <a
          {href}
          class="block px-4 py-2 text-sm text-gray-700"
          class:bg-gray-100={$page.route.id === href}
          role="menuitem"
          tabindex="-1"
          id="user-menu-item-0"
          use:clickOutside={closeMenu}>{label}</a
        >
      {/each}
      <form method="POST" action="/auth?/logout" use:enhance>
        <button type="submit" class="block px-4 py-2 text-sm text-gray-700"
          >Logout</button
        >
      </form>
    </div>
  {/if}
</div>
