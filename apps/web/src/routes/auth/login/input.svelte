<script lang="ts">
  export let name: string;
  export let label: string;
  export let type = 'text';
</script>

<div>
  <label for="id" class="block text-sm font-medium text-gray-700">{label}</label
  >
  <input
    id={name}
    {name}
    {type}
    placeholder={label}
    class="block w-full appearance-none rounded-md border border-gray-300 px-3 py-2 placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
  />
</div>
