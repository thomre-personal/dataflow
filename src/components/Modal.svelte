<script lang="ts">
  import { X } from 'lucide-svelte';
  import type { Snippet } from 'svelte';

  let { title, subtitle, wide = false, className = '', close, children, footer }: {
    title: string;
    subtitle?: string;
    wide?: boolean;
    className?: string;
    close: () => void;
    children: Snippet;
    footer?: Snippet;
  } = $props();
  let dialog: HTMLDialogElement;

  $effect(() => { dialog.showModal(); });
</script>

<dialog bind:this={dialog} class={className} class:wide oncancel={(event) => { event.preventDefault(); close(); }} aria-label={title}>
  <header class="modal-heading">
    <div><h2>{title}</h2>{#if subtitle}<p>{subtitle}</p>{/if}</div>
    <button class="icon-button" aria-label="Close dialog" onclick={close}><X size={19} /></button>
  </header>
  <div class="modal-body">{@render children()}</div>
  {#if footer}<footer class="modal-footer">{@render footer()}</footer>{/if}
</dialog>
