<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;
</script>

<h2>Error</h2>

<pre>{JSON.stringify(data, null, 2)}</pre>
