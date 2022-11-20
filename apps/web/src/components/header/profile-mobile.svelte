<script lang="ts">
  import { enhance } from '$app/forms';
  import BellIcon from '@tabler/icons/bell.svg?component';

  import type { MeQuery } from '~/__generated__/graphql-types';

  export let me: MeQuery['me'];
</script>

<div class="border-t border-gray-200 pt-4 pb-3">
  {#if me}
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
      <a
        href="#"
        class="block px-4 py-2 text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >Your Profile</a
      >
      <a
        href="#"
        class="block px-4 py-2 text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        >Settings</a
      >
      <form method="POST" action="/auth?/logout" use:enhance>
        <button
          type="submit"
          class="block px-4 py-2 text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >Logout</button
        >
      </form>
    </div>
  {:else}
    <a
      href="/auth/login"
      class="block px-4 py-2 text-base font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      >Login</a
    >
  {/if}
</div>
