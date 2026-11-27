<script module lang="ts">
  import { useSvelteFlow } from '@xyflow/svelte';
  export type FitCanvas = ReturnType<typeof useSvelteFlow>['fitView'];
  export type CanvasPosition = ReturnType<typeof useSvelteFlow>['screenToFlowPosition'];
</script>

<script lang="ts">
  import { useSvelteFlowStore } from '@xyflow/svelte';
  import { Maximize, Minus, Plus } from 'lucide-svelte';
  import { onMount } from 'svelte';

  let { connect, fit }: { connect: (fit: FitCanvas, position: CanvasPosition) => void; fit: () => void } = $props();
  const store = useSvelteFlowStore();
  const { screenToFlowPosition } = useSvelteFlow();
  let zoom = $derived(Math.round(store.viewport.zoom * 100));

  onMount(() => connect((options) => store.fitView(options), screenToFlowPosition));

  $effect(() => {
    const canvas = store.domNode;
    if (!canvas) return;
    const scrollCanvas = (event: WheelEvent) => {
      if (!event.altKey || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      const page = event.deltaMode === WheelEvent.DOM_DELTA_PAGE;
      const step = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 20 : 1;
      void store.panBy({
        x: -event.deltaX * (page ? canvas.clientWidth : step),
        y: -event.deltaY * (page ? canvas.clientHeight : step),
      });
    };
    canvas.addEventListener('wheel', scrollCanvas, { capture: true, passive: false });
    return () => canvas.removeEventListener('wheel', scrollCanvas, true);
  });
</script>

<div class="canvas-hud">
  <button class="icon-button" aria-label="Zoom out" onclick={() => void store.zoomOut({ duration: 140 })}><Minus size={16} /></button>
  <span aria-label="Canvas zoom">{zoom}%</span>
  <button class="icon-button" aria-label="Zoom in" onclick={() => void store.zoomIn({ duration: 140 })}><Plus size={16} /></button>
  <span class="hud-divider"></span>
  <button class="icon-button" aria-label="Fit canvas" title="Fit canvas" onclick={fit}><Maximize size={15} /></button>
</div>
