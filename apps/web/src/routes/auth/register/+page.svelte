<script lang="ts">
  import type { PageData } from './$types';
  import OryForm from '../ory-form.svelte';

  export let data: PageData;
</script>

<h2>Register</h2>

<OryForm action={data.oryUi.action} nodes={data.oryUi.nodes} />
