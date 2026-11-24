<script lang="ts">
  import type { Result } from '../lib/workspace';
  let { result, limit = 8, compact = false }: { result: Result; limit?: number; compact?: boolean } = $props();
</script>

<div class="result-grid" class:compact>
  <table>
    <thead><tr>{#each result.columns as column}<th scope="col">{column.name}</th>{/each}</tr></thead>
    <tbody>
      {#each result.rows.slice(0, limit) as row}
        <tr>{#each row as cell, index}<td class:numeric={result.columns[index]?.type === 'decimal'}>{cell ?? '—'}</td>{/each}</tr>
      {/each}
    </tbody>
  </table>
  {#if result.rows.length === 0}<p class="grid-empty">No rows</p>{/if}
</div>
