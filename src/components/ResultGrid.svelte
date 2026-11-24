<script lang="ts">
  import type { Result } from '../lib/workspace';
  let { result, limit = 8, compact = false, full = false }: { result: Result; limit?: number; compact?: boolean; full?: boolean } = $props();
  const rowHeight = 28;
  const overscan = 5;
  let scroller = $state<HTMLDivElement>();
  let scrollTop = $state(0);
  let visibleRows = $state(15);
  let first = $derived(full ? Math.max(0, Math.min(result.rows.length - 1, Math.floor(scrollTop / rowHeight) - overscan)) : 0);
  let last = $derived(Math.min(result.rows.length, full ? first + visibleRows + 2 * overscan : limit));

  $effect(() => {
    if (!full || !scroller) return;
    const element = scroller;
    const measure = () => { visibleRows = Math.ceil(element.clientHeight / rowHeight); };
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (The full table must be reachable for keyboard scrolling.) -->
<div bind:this={scroller} class="result-grid" class:compact class:full-grid={full} class:nowheel={full} class:nopan={full} class:nodrag={full}
  role={full ? 'region' : undefined} aria-label={full ? 'Full table data' : undefined} tabindex={full ? 0 : undefined}
  onscroll={(event) => { if (full) scrollTop = event.currentTarget.scrollTop; }}>
  <table aria-rowcount={full ? result.rows.length + 1 : undefined}>
    <thead><tr>{#each result.columns as column, index}<th scope="col" class:title-column={index < (result.titleColumns ?? 0)}>{column.name}</th>{/each}</tr></thead>
    <tbody>
      {#if first}<tr class="grid-spacer" aria-hidden="true"><td colspan={result.columns.length} style:height={first * rowHeight + 'px'}></td></tr>{/if}
      {#each result.rows.slice(first, last) as row, offset}
        <tr class:grid-even={(first + offset) % 2 === 1} class:footer-row={first + offset >= result.rows.length - (result.footerRows ?? 0)} aria-rowindex={full ? first + offset + 2 : undefined}>
          {#each row as cell, index}
            {#if index < (result.titleColumns ?? 0)}<th scope="row" class="title-column" class:numeric={result.columns[index]?.type === 'decimal'}>{cell || '—'}</th>
            {:else}<td class:numeric={result.columns[index]?.type === 'decimal'}>{cell || '—'}</td>{/if}
          {/each}
        </tr>
      {/each}
      {#if full && last < result.rows.length}<tr class="grid-spacer" aria-hidden="true"><td colspan={result.columns.length} style:height={(result.rows.length - last) * rowHeight + 'px'}></td></tr>{/if}
    </tbody>
  </table>
  {#if result.rows.length === 0}<p class="grid-empty">No rows</p>{/if}
</div>
