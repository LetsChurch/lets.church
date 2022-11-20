<script lang="ts">
  import '@fontsource/inter/variable-full.css';
  import '~/app.css';
  import Header from '~/components/header.svelte';
  import Footer from '~/components/footer.svelte';
  import type { LayoutData } from './$types';

  export let data: LayoutData;
</script>

<Header me={data.me} />

<main class="mt-5">
  <div class="mx-auto max-w-7xl">
    <slot />
  </div>
</main>

<Footer />

<style>
  :global(html, body) {
    height: 100%;
  }

  .layout {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
  }
</style>
