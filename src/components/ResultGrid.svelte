<script lang="ts">
  import { cellStyleCss } from '../lib/cell-style';
  import { defaultPreviewRowHeight as rowHeight } from '../lib/workspace';
  import type { Result } from '../lib/workspace';
  let { result, limit = 8, compact = false, full = false, label = 'Full table data' }: {
    result: Result; limit?: number; compact?: boolean; full?: boolean; label?: string;
  } = $props();
  const overscan = 5;
  let scroller = $state<HTMLDivElement>();
  let scrollTop = $state(0);
  let viewportHeight = $state(15 * rowHeight);
  let widths = $derived(full ? result.columnWidths : undefined);
  let heights = $derived(full ? result.rowHeights : undefined);
  let offsets = $derived.by(() => {
    if (!heights) return;
    const positions = [0];
    for (const height of heights) positions.push(positions[positions.length - 1] + height);
    return positions;
  });
  let first = $derived(full ? Math.max(0, rowAt(scrollTop) - overscan) : 0);
  let last = $derived(Math.min(result.rows.length, full ? rowAt(scrollTop + viewportHeight) + overscan + 1 : limit));

  function rowAt(offset: number) {
    if (!offsets) return Math.min(result.rows.length - 1, Math.floor(offset / rowHeight));
    let low = 0;
    let high = result.rows.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (offsets[mid + 1] <= offset) low = mid + 1;
      else high = mid;
    }
    return Math.min(result.rows.length - 1, low);
  }

  function rowOffset(index: number) {
    return offsets?.[index] ?? index * rowHeight;
  }

  $effect(() => {
    if (!full || !scroller) return;
    const element = scroller;
    const measure = () => { viewportHeight = element.clientHeight; };
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (The full table must be reachable for keyboard scrolling.) -->
<div bind:this={scroller} class="result-grid" data-table-style={result.tableStyle ?? 'banded'} class:compact class:full-grid={full} class:nowheel={full} class:nopan={full} class:nodrag={full}
  role={full ? 'region' : undefined} aria-label={full ? label : undefined} tabindex={full ? 0 : undefined}
  onscroll={(event) => { if (full) scrollTop = event.currentTarget.scrollTop; }}>
  <table class:sized-preview={Boolean(widths)} style:width={widths ? widths.reduce((sum, width) => sum + width, 0) + 'px' : undefined}
    aria-rowcount={full ? result.rows.length + 1 : undefined}>
    {#if widths}<colgroup>{#each widths as width}<col style:width={width + 'px'} />{/each}</colgroup>{/if}
    <thead><tr>{#each result.columns as column, index}<th scope="col" class:title-column={index < (result.titleColumns ?? 0)}>{column.name}</th>{/each}</tr></thead>
    <tbody>
      {#if first}<tr class="grid-spacer" aria-hidden="true"><td colspan={result.columns.length} style:height={rowOffset(first) + 'px'}></td></tr>{/if}
      {#each result.rows.slice(first, last) as row, offset}
        <tr class:grid-even={(first + offset) % 2 === 1} class:footer-row={first + offset >= result.rows.length - (result.footerRows ?? 0)}
          style:height={heights ? heights[first + offset] + 'px' : undefined} aria-rowindex={full ? first + offset + 2 : undefined}>
          {#each row as cell, index}
            {@const style = cellStyleCss(result.cellStyles?.[first + offset]?.[index])}
            {#if index < (result.titleColumns ?? 0)}<th scope="row" class="title-column" class:numeric={result.columns[index]?.type === 'decimal'} {style}>{cell || '—'}</th>
            {:else}<td class:numeric={result.columns[index]?.type === 'decimal'} {style}>{cell || '—'}</td>{/if}
          {/each}
        </tr>
      {/each}
      {#if full && last < result.rows.length}<tr class="grid-spacer" aria-hidden="true"><td colspan={result.columns.length} style:height={rowOffset(result.rows.length) - rowOffset(last) + 'px'}></td></tr>{/if}
    </tbody>
  </table>
  {#if result.rows.length === 0}<p class="grid-empty">No rows</p>{/if}
</div>
