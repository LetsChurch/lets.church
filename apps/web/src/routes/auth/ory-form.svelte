<script lang="ts">
  import type { OryUiNode } from './ory.server';

  export let nodes: Array<OryUiNode>;
  export let action: string;
  export let messages: Array<{ text: string }> = [];
</script>

{#each messages as message}
  <p>{message.text}</p>
{/each}

<form method="post" {action}>
  {#each nodes as node}
    {@const { type, ...attributes } = node.attributes}
    <div>
      {#if type === 'submit'}
        <button {type} {...attributes}>{node.meta.label?.text}</button>
      {:else if type !== 'hidden'}
        <div>
          <label>
            {node.meta.label?.text}:
            <input {type} {...attributes} />
          </label>
        </div>
      {:else}
        <input {type} {...attributes} />
      {/if}
    </div>
  {/each}
</form>
