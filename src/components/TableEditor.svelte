<script lang="ts">
  import { CircleAlert, ClipboardPlus, Plus, Trash2 } from 'lucide-svelte';
  import { tick } from 'svelte';
  import { dataRowCount, newId } from '../lib/workspace';
  import { countLabel } from '../lib/format';
  import { describeCellIssue, invalidTableCells, MAX_COLUMNS, MAX_ROWS, parseDelimited } from '../lib/clipboard';
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
  let issues = $derived([...invalidTableCells(block)]);
  let issueByCell = $derived(new Map(issues.map((issue) => [issue.row + ':' + issue.column, issue.message])));
  let dataRows = $derived(dataRowCount(block));
  let titleColumns = $derived(block.titleColumns ?? 0);
  let footerRows = $derived(block.footerRows ?? 0);

  const editorId = $props.id();
  const cellId = (rowId: string, columnId: string) => editorId + '-cell-' + rowId + '-' + columnId;

  async function focusCell(rowIndex: number, rowId: string, columnId: string) {
    limit = Math.max(limit, rowIndex + 1);
    await tick();
    document.getElementById(cellId(rowId, columnId))?.focus();
  }

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
      const intoFooter = footerRows > 0 && firstRow >= dataRows;
      const boundary = intoFooter ? block.rows.length : dataRows;
      const addedRows = Math.max(0, firstRow + grid.length - boundary);
      const height = block.rows.length + addedRows;
      if (width > MAX_COLUMNS || height > MAX_ROWS) throw new Error('The pasted range would exceed the table size limit.');
      const columns = Array.from({ length: width }, (_, i) => block.columns[i]
        ?? { id: newId(), name: 'Column ' + (i + 1), type: 'text' as const });
      const rows = Array.from({ length: height }, (_, rowIndex) => {
        const existing = rowIndex < boundary ? block.rows[rowIndex] :
          rowIndex >= boundary + addedRows ? block.rows[rowIndex - addedRows] : undefined;
        return {
          id: existing?.id ?? newId(),
          cells: Array.from({ length: width }, (_, columnIndex) =>
            grid[rowIndex - firstRow]?.[columnIndex - firstColumn] ?? existing?.cells[columnIndex] ?? ''),
        };
      });
      change({ columns, rows, footerRows: intoFooter ? footerRows + addedRows : block.footerRows });
    } catch (problem) {
      error(problem instanceof Error ? problem.message : String(problem));
    }
  }

  function insertRow(index: number) {
    if (block.rows.length >= MAX_ROWS) { error('This table has reached the row limit.'); return; }
    const row = { id: newId(), cells: block.columns.map(() => '') };
    change({
      rows: [...block.rows.slice(0, index), row, ...block.rows.slice(index)],
      footerRows: index > dataRows ? footerRows + 1 : block.footerRows,
    });
    limit = Math.max(limit, index + 1);
    return row.id;
  }

  function insertColumn(index: number) {
    if (block.columns.length >= MAX_COLUMNS) { error('This table has reached the column limit.'); return; }
    const first = block.columns.length + 1;
    let name = 'Column ' + first;
    for (let i = first + 1; block.columns.some((column) => column.name.toLowerCase() === name.toLowerCase()); i++) name = 'Column ' + i;
    const column = { id: newId(), name, type: 'text' as const };
    change({
      columns: [...block.columns.slice(0, index), column, ...block.columns.slice(index)],
      rows: block.rows.map((row) => ({ ...row, cells: [...row.cells.slice(0, index), '', ...row.cells.slice(index)] })),
      titleColumns: index < titleColumns ? titleColumns + 1 : block.titleColumns,
    });
    return column.id;
  }

  function insertWithArrow(event: KeyboardEvent, row: number, column: number) {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const index = row + Number(event.key === 'ArrowDown');
      const id = insertRow(index);
      if (id) void focusCell(index, id, block.columns[column].id);
    } else {
      const index = column + Number(event.key === 'ArrowRight');
      const id = insertColumn(index);
      if (id) void focusCell(row, block.rows[row].id, id);
    }
  }

  function updateColumn(index: number, patch: { name?: string; type?: ColumnType }) {
    change({ columns: block.columns.map((column, i) => i === index ? { ...column, ...patch } : column) });
  }

  function updateCount(event: Event & { currentTarget: HTMLInputElement }, key: 'titleColumns' | 'footerRows', max: number) {
    const input = event.currentTarget;
    const count = Math.max(0, Math.min(max, Math.trunc(input.valueAsNumber || 0)));
    input.value = String(count);
    if (count !== (block[key] ?? 0)) change({ [key]: count });
  }
</script>

<div class="table-tools">
  <button class="button secondary" onclick={paste}><ClipboardPlus size={15} /> Paste range</button>
  <button class="button ghost" title="In a cell: ⌥↑ inserts above, ⌥↓ inserts below" onclick={() => insertRow(dataRows)}><Plus size={15} /> Row</button>
  <button class="button ghost" title="In a cell: ⌥← inserts left, ⌥→ inserts right" onclick={() => insertColumn(block.columns.length)}><Plus size={15} /> Column</button>
  <label class="table-style-label">Style
    <select value={block.style} onchange={(event) => change({ style: event.currentTarget.value as TableStyle })}>
      {#each styles as [value, name]}<option {value}>{name}</option>{/each}
    </select>
  </label>
  <label class="table-style-label">Title columns<input type="number" min="0" max={block.columns.length} value={titleColumns}
    onchange={(event) => updateCount(event, 'titleColumns', block.columns.length)} /></label>
  <label class="table-style-label" title="Footer rows are excluded from SQL and charts">Footer rows<input type="number" min="0" max={block.rows.length} value={footerRows}
    onchange={(event) => updateCount(event, 'footerRows', block.rows.length)} /></label>
</div>
{#if issues.length}
  {@const first = issues[0]}
  <div class="table-validation" role="status">
    <CircleAlert size={16} />
    <div><strong>{countLabel(issues.length, 'invalid cell')}</strong><p>{describeCellIssue(block, first)}</p></div>
    <button class="text-button" onclick={() => void focusCell(first.row, block.rows[first.row].id, block.columns[first.column].id)}>Go to cell</button>
  </div>
{/if}
<div class="editor-grid {block.style}">
  <table>
    <thead><tr><th scope="col" class="row-index">#</th>
      {#each block.columns as column, index (column.id)}
        <th scope="col" class:title-column={index < titleColumns}>
          <input value={column.name} onchange={(event) => updateColumn(index, { name: event.currentTarget.value })} aria-label={'Column ' + (index + 1) + ' name'} />
          <select value={column.type} onchange={(event) => updateColumn(index, { type: event.currentTarget.value as ColumnType })} aria-label={column.name + ' type'}>
            {#each types as [value, name]}<option {value}>{name}</option>{/each}
          </select>
        </th>
      {/each}
      <th scope="col"><span class="sr-only">Actions</span></th>
    </tr></thead>
    <tbody>{#each block.rows.slice(0, limit) as row, rowIndex (row.id)}
      <tr class:footer-row={rowIndex >= dataRows}><th scope="row" class="row-index">{rowIndex + 1}</th>
        {#each block.columns as column, columnIndex (column.id)}
          {@const id = cellId(row.id, column.id)}
          {@const issue = issueByCell.get(rowIndex + ':' + columnIndex)}
          <td class:invalid-cell={Boolean(issue)} class:title-column={columnIndex < titleColumns}><input
            {id}
            class:numeric={column.type === 'decimal'}
            value={row.cells[columnIndex] ?? ''}
            aria-label={column.name + ' row ' + (rowIndex + 1)}
            aria-invalid={issue ? true : undefined}
            aria-describedby={issue ? id + '-error' : undefined}
            oninput={(event) => updateCell(rowIndex, columnIndex, event.currentTarget.value)}
            onkeydown={(event) => insertWithArrow(event, rowIndex, columnIndex)}
            onpaste={(event) => pasteCells(event, rowIndex, columnIndex)}
          />{#if issue}<span id={id + '-error'} class="cell-validation-message">{issue}</span>{/if}</td>
        {/each}
        <td class="row-actions"><button class="icon-button small" aria-label={'Delete row ' + (rowIndex + 1)} onclick={() => change({
          rows: block.rows.filter((candidate) => candidate.id !== row.id),
          footerRows: rowIndex >= dataRows ? footerRows - 1 : block.footerRows,
        })}><Trash2 size={13} /></button></td>
      </tr>
    {/each}</tbody>
  </table>
  {#if !block.rows.length}<p class="grid-empty">Add a row or paste a range to begin.</p>{/if}
</div>
<div class="table-count"><span>{countLabel(block.rows.length, 'row')} · {countLabel(block.columns.length, 'column')}</span>
  {#if block.rows.length > limit}<button class="text-button" onclick={() => limit += 100}>Show more</button>{/if}
</div>
