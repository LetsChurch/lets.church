<script lang="ts">
  import { enhance } from '$app/forms';
  import Input from './input.svelte';
</script>

<form
  method="POST"
  action="/auth?/login"
  use:enhance
  class="mx-auto max-w-md space-y-6"
>
  <Input name="id" label="Username or Email" />
  <Input name="password" label="Password" type="password" />
  <button
    type="submit"
    class="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
    >Login</button
  >
</form>
