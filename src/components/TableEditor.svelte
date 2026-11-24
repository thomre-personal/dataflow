<script lang="ts">
  import { ClipboardPlus, Plus, Trash2 } from 'lucide-svelte';
  import { newId } from '../lib/workspace';
  import { countLabel } from '../lib/format';
  import { MAX_COLUMNS, MAX_ROWS, parseDelimited } from '../lib/clipboard';
  import type { ColumnType, TableBlock, TableStyle } from '../lib/workspace';

  let { block, change, paste, error }: {
    block: TableBlock;
    change: (patch: Partial<TableBlock>) => void;
    paste: () => void;
    error: (message: string) => void;
  } = $props();

  const types: [ColumnType, string][] = [['text', 'Text'], ['decimal', 'Number'], ['date', 'Date'], ['boolean', 'Boolean']];
  const styles: [TableStyle, string][] = [['plain', 'Plain'], ['banded', 'Banded'], ['emphasis', 'Emphasis'], ['grid', 'Grid']];
  let limit = $state(60);

  function updateCell(rowIndex: number, colIndex: number, value: string) {
    const rows = block.rows.map((row, i) => i === rowIndex
      ? { ...row, cells: row.cells.map((cell, j) => j === colIndex ? value : cell) } : row);
    change({ rows });
  }

  function pasteCells(event: ClipboardEvent, firstRow: number, firstColumn: number) {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    try {
      const grid = parseDelimited(text);
      const width = Math.max(block.columns.length, firstColumn + (grid[0]?.length ?? 0));
      const height = Math.max(block.rows.length, firstRow + grid.length);
      if (width > MAX_COLUMNS || height > MAX_ROWS) throw new Error('The pasted range would exceed the table size limit.');
      const columns = Array.from({ length: width }, (_, i) => block.columns[i]
        ?? { id: newId(), name: 'Column ' + (i + 1), type: 'text' as const });
      const rows = Array.from({ length: height }, (_, rowIndex) => ({
        id: block.rows[rowIndex]?.id ?? newId(),
        cells: Array.from({ length: width }, (_, columnIndex) =>
          grid[rowIndex - firstRow]?.[columnIndex - firstColumn] ?? block.rows[rowIndex]?.cells[columnIndex] ?? ''),
      }));
      change({ columns, rows });
    } catch (problem) {
      error(problem instanceof Error ? problem.message : String(problem));
    }
  }

  function addRow() {
    if (block.rows.length >= MAX_ROWS) return error('This table has reached the row limit.');
    change({ rows: [...block.rows, { id: newId(), cells: block.columns.map(() => '') }] });
    limit = Math.max(limit, block.rows.length + 1);
  }

  function addColumn() {
    if (block.columns.length >= MAX_COLUMNS) return error('This table has reached the column limit.');
    const first = block.columns.length + 1;
    let name = 'Column ' + first;
    for (let i = first + 1; block.columns.some((column) => column.name.toLowerCase() === name.toLowerCase()); i++) name = 'Column ' + i;
    change({
      columns: [...block.columns, { id: newId(), name, type: 'text' }],
      rows: block.rows.map((row) => ({ ...row, cells: [...row.cells, ''] })),
    });
  }

  function updateColumn(index: number, patch: { name?: string; type?: ColumnType }) {
    change({ columns: block.columns.map((column, i) => i === index ? { ...column, ...patch } : column) });
  }
</script>

<div class="table-tools">
  <button class="button secondary" onclick={paste}><ClipboardPlus size={15} /> Paste range</button>
  <button class="button ghost" onclick={addRow}><Plus size={15} /> Row</button>
  <button class="button ghost" onclick={addColumn}><Plus size={15} /> Column</button>
  <label class="table-style-label">Style
    <select value={block.style} onchange={(event) => change({ style: event.currentTarget.value as TableStyle })}>
      {#each styles as [value, name]}<option {value}>{name}</option>{/each}
    </select>
  </label>
</div>
<div class="editor-grid {block.style}">
  <table>
    <thead><tr><th scope="col" class="row-index">#</th>
      {#each block.columns as column, index (column.id)}
        <th scope="col">
          <input value={column.name} onchange={(event) => updateColumn(index, { name: event.currentTarget.value })} aria-label={'Column ' + (index + 1) + ' name'} />
          <select value={column.type} onchange={(event) => updateColumn(index, { type: event.currentTarget.value as ColumnType })} aria-label={column.name + ' type'}>
            {#each types as [value, name]}<option {value}>{name}</option>{/each}
          </select>
        </th>
      {/each}
      <th scope="col"><span class="sr-only">Actions</span></th>
    </tr></thead>
    <tbody>{#each block.rows.slice(0, limit) as row, rowIndex (row.id)}
      <tr><th scope="row" class="row-index">{rowIndex + 1}</th>
        {#each block.columns as column, columnIndex (column.id)}
          <td><input
            class:numeric={column.type === 'decimal'}
            value={row.cells[columnIndex] ?? ''}
            aria-label={column.name + ' row ' + (rowIndex + 1)}
            oninput={(event) => updateCell(rowIndex, columnIndex, event.currentTarget.value)}
            onpaste={(event) => pasteCells(event, rowIndex, columnIndex)}
          /></td>
        {/each}
        <td class="row-actions"><button class="icon-button small" aria-label={'Delete row ' + (rowIndex + 1)} onclick={() => change({ rows: block.rows.filter((candidate) => candidate.id !== row.id) })}><Trash2 size={13} /></button></td>
      </tr>
    {/each}</tbody>
  </table>
  {#if !block.rows.length}<p class="grid-empty">Add a row or paste a range to begin.</p>{/if}
</div>
<div class="table-count"><span>{countLabel(block.rows.length, 'row')} · {countLabel(block.columns.length, 'column')}</span>
  {#if block.rows.length > limit}<button class="text-button" onclick={() => limit += 100}>Show more</button>{/if}
</div>
