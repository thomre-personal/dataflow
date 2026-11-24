<script lang="ts">
  import { Pencil } from 'lucide-svelte';
  import { tick } from 'svelte';

  let { title, rename }: { title: string; rename: (title: string) => void } = $props();
  let editing = $state(false);
  let draft = $state('');
  let trigger = $state<HTMLButtonElement>();
  let field = $state<HTMLInputElement>();

  async function start(event: MouseEvent) {
    event.stopPropagation();
    draft = title;
    editing = true;
    await tick();
    field?.focus();
    field?.select();
  }

  function finish(save: boolean) {
    if (!editing) return;
    editing = false;
    if (save) rename(draft);
  }

  async function keyboard(event: KeyboardEvent) {
    if (event.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return;
    event.preventDefault();
    event.stopPropagation();
    finish(event.key === 'Enter');
    await tick();
    trigger?.focus();
  }
</script>

{#if editing}
  <input bind:this={field} bind:value={draft} class="block-name-input nodrag nopan" aria-label="Block name"
    onkeydown={keyboard} onblur={() => finish(true)} />
{:else}
  <button bind:this={trigger} class="block-name-button nodrag" type="button" title={'Rename ' + title}
    aria-label={'Rename ' + title} onclick={start}>
    <span>{title}</span><Pencil size={12} aria-hidden="true" />
  </button>
{/if}
