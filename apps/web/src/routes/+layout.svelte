<script lang="ts">
  import type { LayoutData } from './$types';

  export let data: LayoutData;
</script>

<h1>Let's Church</h1>

{#if 'logoutUrl' in data.logoutUrl}
  <a href={data.logoutUrl.logoutUrl}>Logout</a>
{/if}

<pre>
  {#if 'error' in data.session}
    No session
  {:else}
    {JSON.stringify(data.session, null, 2)}
  {/if}
</pre>

<slot />
