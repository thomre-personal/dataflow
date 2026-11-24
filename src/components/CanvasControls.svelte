<script module lang="ts">
  import type { useSvelteFlow } from '@xyflow/svelte';
  export type FitCanvas = ReturnType<typeof useSvelteFlow>['fitView'];
</script>

<script lang="ts">
  import { useSvelteFlowStore } from '@xyflow/svelte';
  import { Maximize, Minus, Plus } from 'lucide-svelte';
  import { onMount } from 'svelte';

  let { connect, fit }: { connect: (fit: FitCanvas) => void; fit: () => void } = $props();
  const store = useSvelteFlowStore();
  let zoom = $derived(Math.round(store.viewport.zoom * 100));

  onMount(() => connect((options) => store.fitView(options)));
</script>

<div class="canvas-hud">
  <button class="icon-button" aria-label="Zoom out" onclick={() => void store.zoomOut({ duration: 140 })}><Minus size={16} /></button>
  <span aria-label="Canvas zoom">{zoom}%</span>
  <button class="icon-button" aria-label="Zoom in" onclick={() => void store.zoomIn({ duration: 140 })}><Plus size={16} /></button>
  <span class="hud-divider"></span>
  <button class="icon-button" aria-label="Fit canvas" title="Fit canvas" onclick={fit}><Maximize size={15} /></button>
</div>
