<script lang="ts">
  import type { Result } from '../lib/workspace';
  let { result, limit = 8, compact = false, full = false }: { result: Result; limit?: number; compact?: boolean; full?: boolean } = $props();
  const rowHeight = 28;
  const overscan = 5;
  let scrollTop = $state(0);
  let first = $derived(full ? Math.max(0, Math.min(result.rows.length - 1, Math.floor(scrollTop / rowHeight) - overscan)) : 0);
  let last = $derived(Math.min(result.rows.length, full ? first + 25 : limit));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (The full table must be reachable for keyboard scrolling.) -->
<div class="result-grid" class:compact class:full-grid={full} class:nowheel={full} class:nopan={full} class:nodrag={full}
  role={full ? 'region' : undefined} aria-label={full ? 'Full table data' : undefined} tabindex={full ? 0 : undefined}
  onscroll={(event) => { if (full) scrollTop = event.currentTarget.scrollTop; }}>
  <table aria-rowcount={full ? result.rows.length + 1 : undefined}>
    <thead><tr>{#each result.columns as column}<th scope="col">{column.name}</th>{/each}</tr></thead>
    <tbody>
      {#if first}<tr class="grid-spacer" aria-hidden="true"><td colspan={result.columns.length} style:height={first * rowHeight + 'px'}></td></tr>{/if}
      {#each result.rows.slice(first, last) as row, offset}
        <tr class:grid-even={(first + offset) % 2 === 1} aria-rowindex={full ? first + offset + 2 : undefined}>
          {#each row as cell, index}<td class:numeric={result.columns[index]?.type === 'decimal'}>{cell || '—'}</td>{/each}
        </tr>
      {/each}
      {#if full && last < result.rows.length}<tr class="grid-spacer" aria-hidden="true"><td colspan={result.columns.length} style:height={(result.rows.length - last) * rowHeight + 'px'}></td></tr>{/if}
    </tbody>
  </table>
  {#if result.rows.length === 0}<p class="grid-empty">No rows</p>{/if}
</div>
