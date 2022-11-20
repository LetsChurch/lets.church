<script lang="ts">
  export let href: string;
  export let active = false;
</script>

<a
  {href}
  class={`block border-l-4 py-2 pl-3 pr-4 text-base font-medium ${
    active
      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
      : 'border-transparent text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800'
  }`}><slot /></a
>
