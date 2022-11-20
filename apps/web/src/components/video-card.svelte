<script lang="ts">
  export let title: string;
  export let channel: string;
  export let href: string;
  export let avatarUrl: string;
</script>

<div class="relative space-y-3">
  <div class="aspect-video bg-gray-100" />
  <div class="flex items-center space-x-3 overflow-hidden">
    <img class="h-8 w-8 rounded-full" src={avatarUrl} alt="" />
    <a {href} class="block min-w-0 before:absolute before:inset-0">
      <p class="truncate text-sm font-medium text-gray-900">{title}</p>
      <p class="truncate text-sm text-gray-500">
        {channel}
      </p>
    </a>
  </div>
</div>
