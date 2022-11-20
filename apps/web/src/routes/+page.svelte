<script lang="ts">
  import VideoCard from '~/components/video-card.svelte';
</script>

<ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
  {#each Array(30) as _}
    <VideoCard
      title="Hello, World!"
      channel="Let's Church"
      href="#"
      avatarUrl="https://images.unsplash.com/photo-1477672680933-0287a151330e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
    />
  {/each}
</ul>
