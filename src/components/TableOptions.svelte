<script lang="ts">
  import type { TableBlock, TableStyle } from '../lib/workspace';

  let { block, change }: { block: TableBlock; change: (patch: Partial<TableBlock>) => void } = $props();
  const styles: [TableStyle, string][] = [['plain', 'Plain'], ['banded', 'Banded'], ['emphasis', 'Emphasis'], ['grid', 'Grid']];

  function updateCount(input: HTMLInputElement, key: 'titleColumns' | 'footerRows', max: number) {
    const count = Math.max(0, Math.min(max, Math.trunc(input.valueAsNumber || 0)));
    input.value = String(count);
    if (count !== (block[key] ?? 0)) change({ [key]: count });
  }
</script>

<section class="inspector-section table-options" aria-label="Table options">
  <div class="section-title"><h3>Table options</h3></div>
  <div class="table-options-fields">
    <label class="field">Title columns<input type="number" min="0" max={block.columns.length} value={block.titleColumns ?? 0}
      onchange={(event) => updateCount(event.currentTarget, 'titleColumns', block.columns.length)} /></label>
    <label class="field" title="Footer rows are excluded from SQL and charts">Footer rows<input type="number" min="0" max={block.rows.length} value={block.footerRows ?? 0}
      onchange={(event) => updateCount(event.currentTarget, 'footerRows', block.rows.length)} /></label>
    <label class="field">First row
      <select value={block.rowIndexBase ?? 1} onchange={(event) => change({ rowIndexBase: event.currentTarget.value === '0' ? 0 : 1 })}>
        <option value={1}>1</option><option value={0}>0</option>
      </select>
    </label>
  </div>
  <label class="field table-option-style">Style
    <select value={block.style} onchange={(event) => change({ style: event.currentTarget.value as TableStyle })}>
      {#each styles as [value, name]}<option {value}>{name}</option>{/each}
    </select>
  </label>
</section>
