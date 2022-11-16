<script lang="ts">
  import { enhance } from '$app/forms';
</script>

<h2>Login</h2>

<form method="POST" action="/auth?/login" use:enhance>
  <input name="id" placeholder="Username or Email" />
  <input name="password" type="password" placeholder="password" />
  <button type="submit">Login</button>
</form>
