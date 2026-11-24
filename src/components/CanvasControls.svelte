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

    const wheelOverTable = (event: WheelEvent) => {
      const { deltaMode, deltaX, deltaY } = event;
      if (event.defaultPrevented || event.ctrlKey || event.shiftKey || !deltaY || Math.abs(deltaX) > Math.abs(deltaY)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const table = target.closest('.nowheel');
      if (!table) return;

      for (let element: Element | null = target; element; element = element.parentElement) {
        const maxScroll = element.scrollHeight - element.clientHeight;
        const canScroll = deltaY > 0 ? element.scrollTop < maxScroll - 1 : element.scrollTop > 1;
        if (maxScroll > 1 && canScroll && /^(auto|scroll)$/.test(getComputedStyle(element).overflowY)) return;
        if (element === table) break;
      }

      event.preventDefault();
      const pixels = deltaMode === WheelEvent.DOM_DELTA_LINE ? 20
        : deltaMode === WheelEvent.DOM_DELTA_PAGE ? canvas.clientHeight : 1;
      void store.panBy({ x: 0, y: -deltaY * pixels });
    };

    canvas.addEventListener('wheel', wheelOverTable, { capture: true, passive: false });
    return () => canvas.removeEventListener('wheel', wheelOverTable, true);
  });
</script>

<div class="canvas-hud">
  <button class="icon-button" aria-label="Zoom out" onclick={() => void store.zoomOut({ duration: 140 })}><Minus size={16} /></button>
  <span aria-label="Canvas zoom">{zoom}%</span>
  <button class="icon-button" aria-label="Zoom in" onclick={() => void store.zoomIn({ duration: 140 })}><Plus size={16} /></button>
  <span class="hud-divider"></span>
  <button class="icon-button" aria-label="Fit canvas" title="Fit canvas" onclick={fit}><Maximize size={15} /></button>
</div>
