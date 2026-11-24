<script module lang="ts">
  export type Confirmation = { title: string; message: string; label: string; accept: () => void };
</script>

<script lang="ts">
  import Modal from './Modal.svelte';
  let { request, close }: { request: Confirmation; close: () => void } = $props();
</script>

{#snippet content()}<p>{request.message}</p>{/snippet}
{#snippet footer()}
  <!-- svelte-ignore a11y_autofocus (Focus the safe action in a confirmation dialog.) -->
  <button class="button secondary" onclick={close} autofocus>Cancel</button>
  <button class="button secondary delete-block" onclick={() => { const accept = request.accept; close(); accept(); }}>{request.label}</button>
{/snippet}
<Modal title={request.title} {close} children={content} {footer} />
