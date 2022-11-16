<script lang="ts">
  import type { LayoutData } from './$types';
  import { enhance } from '$app/forms';

  export let data: LayoutData;
</script>

<h1>Let's Church</h1>

<nav>
  <ul>
    <li><a href="/">Home</a></li>
    <li>
      {#if data.me?.id}
        <form method="POST" action="/auth?/logout" use:enhance>
          <button type="submit">Logout</button>
        </form>
      {:else}
        <a href="/auth/login">Login</a>
      {/if}
    </li>
  </ul>
</nav>

{#if data.me}
  {data.me.id}
{:else}
  Not logged in!
{/if}

<slot />
