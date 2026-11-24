<script lang="ts">
  import { CircleAlert, ClipboardPlus, Plus, Trash2 } from 'lucide-svelte';
  import { tick } from 'svelte';
  import { columnLetter, dataRowCount, newId, rowNumber, tableInputs } from '../lib/workspace';
  import { countLabel } from '../lib/format';
  import { MAX_COLUMNS, MAX_ROWS, parseDelimited } from '../lib/clipboard';
  import { bindCellFormula, cellFormulaText, isFormulaEntry, suggestFunctions } from '../lib/formulas';
  import { describeCellIssue, invalidTableCells, tableData } from '../lib/table-data';
  import { eventHotkey, hotkeyLabel } from '../lib/preferences';
  import type { Hotkeys } from '../lib/preferences';
  import type { ColumnType, Formula, TableBlock, TableStyle, Workspace } from '../lib/workspace';
  import FormulaSuggestions from './FormulaSuggestions.svelte';

  let { block, workspace, hotkeys, change, paste, error, inline = false }: {
    block: TableBlock;
    workspace: Workspace;
    hotkeys: Hotkeys;
    change: (patch: Partial<TableBlock>) => void;
    paste: () => void;
    error: (message: string) => void;
    inline?: boolean;
  } = $props();

  const types: [ColumnType, string][] = [['auto', 'Auto'], ['text', 'Text'], ['decimal', 'Number'], ['date', 'Date'], ['boolean', 'Boolean']];
  const styles: [TableStyle, string][] = [['plain', 'Plain'], ['banded', 'Banded'], ['emphasis', 'Emphasis'], ['grid', 'Grid']];
  let limit = $state(60);
  let data = $derived(tableData(block, workspace));
  let inputs = $derived(tableInputs(workspace, block.id));
  let dataRows = $derived(dataRowCount(block));
  let titleColumns = $derived(block.titleColumns ?? 0);
  let footerRows = $derived(block.footerRows ?? 0);
  let editing = $state<{ id: string; input: HTMLInputElement; row: number; column: number }>();
  let cellDraft = $state('');
  let hideSuggestions = $state(false);
  let activeSuggestion = $state(0);
  let suggestions = $derived(editing && !hideSuggestions ? suggestFunctions(cellDraft) : []);
  let issues = $derived([...invalidTableCells(block, data)].filter((issue) =>
    issue.row !== editing?.row || issue.column !== editing.column || !isFormulaEntry(cellDraft)));
  let issueByCell = $derived(new Map(issues.map((issue) => [issue.row + ':' + issue.column, issue.message])));

  const editorId = $props.id();
  const suggestionsId = editorId + '-formulas';
  const cellId = (rowId: string, columnId: string) => editorId + '-cell-' + rowId + '-' + columnId;

  async function focusCell(rowIndex: number, rowId: string, columnId: string) {
    limit = Math.max(limit, rowIndex + 1);
    await tick();
    document.getElementById(cellId(rowId, columnId))?.focus();
  }

  function updateCell(rowIndex: number, colIndex: number, value: string) {
    const rows = block.rows.map((row, i) => {
      if (i !== rowIndex) return row;
      const formulas = { ...row.formulas };
      bindCellFormula(formulas, block.columns, colIndex, value, inputs);
      return { ...row, formulas, cells: row.cells.map((cell, j) => j === colIndex ? value : cell) };
    });
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
        ?? { id: newId(), name: columnLetter(i), type: 'auto' as const });
      const rows = Array.from({ length: height }, (_, rowIndex) => {
        const existing = rowIndex < boundary ? block.rows[rowIndex] :
          rowIndex >= boundary + addedRows ? block.rows[rowIndex - addedRows] : undefined;
        const formulas = { ...existing?.formulas };
        const cells = Array.from({ length: width }, (_, columnIndex) => {
          const pasted = grid[rowIndex - firstRow]?.[columnIndex - firstColumn];
          if (pasted !== undefined) bindCellFormula(formulas, columns, columnIndex, pasted, inputs);
          return pasted ?? existing?.cells[columnIndex] ?? '';
        });
        return {
          id: existing?.id ?? newId(),
          cells, formulas,
        };
      });
      change({ columns, rows, footerRows: intoFooter ? footerRows + addedRows : block.footerRows });
      if (editing) cellDraft = cellFormulaText(rows[firstRow], columns, firstColumn, inputs);
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
    let position = index;
    while (block.columns.some((column) => column.name.toLowerCase() === columnLetter(position).toLowerCase())) position++;
    const column = { id: newId(), name: columnLetter(position), type: 'auto' as const };
    change({
      columns: [...block.columns.slice(0, index), column, ...block.columns.slice(index)],
      rows: block.rows.map((row) => ({ ...row, cells: [...row.cells.slice(0, index), '', ...row.cells.slice(index)] })),
      titleColumns: index < titleColumns ? titleColumns + 1 : block.titleColumns,
    });
    return column.id;
  }

  function insertWithShortcut(event: KeyboardEvent, row: number, column: number) {
    const shortcut = eventHotkey(event);
    const insertRowShortcut = shortcut === hotkeys.rowAbove || shortcut === hotkeys.rowBelow;
    if (!insertRowShortcut && shortcut !== hotkeys.columnLeft && shortcut !== hotkeys.columnRight) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (insertRowShortcut) {
      const index = row + Number(shortcut === hotkeys.rowBelow);
      const id = insertRow(index);
      if (id) void focusCell(index, id, block.columns[column].id);
    } else {
      const index = column + Number(shortcut === hotkeys.columnRight);
      const id = insertColumn(index);
      if (id) void focusCell(row, block.rows[row].id, id);
    }
  }

  function completeFormula(name: Formula['name']) {
    if (!editing) return;
    const { input, row, column } = editing;
    cellDraft = '=' + name + '()';
    input.value = cellDraft;
    updateCell(row, column, cellDraft);
    input.setSelectionRange(cellDraft.length - 1, cellDraft.length - 1);
  }

  function cellKeyboard(event: KeyboardEvent & { currentTarget: HTMLInputElement }, row: number, column: number) {
    if (event.isComposing) return;
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (plain && suggestions.length && ['ArrowDown', 'ArrowUp', 'Escape', 'Enter', 'Tab'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') hideSuggestions = true;
      else if (event.key === 'Enter' || event.key === 'Tab') completeFormula(suggestions[activeSuggestion]);
      else activeSuggestion = (activeSuggestion + (event.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length;
    } else if (plain && event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.blur();
    } else {
      insertWithShortcut(event, row, column);
    }
  }

  function updateColumn(index: number, patch: { name?: string; type?: ColumnType }) {
    change({ columns: block.columns.map((column, i) => i === index ? { ...column, ...patch } : column) });
  }

  function deleteColumn(index: number) {
    if (block.columns.length <= 1) return;
    const columnId = block.columns[index].id;
    change({
      columns: block.columns.filter((column) => column.id !== columnId),
      rows: block.rows.map((row) => {
        const formulas = { ...row.formulas };
        delete formulas[columnId];
        return { ...row, formulas, cells: row.cells.filter((_, position) => position !== index) };
      }),
      titleColumns: index < titleColumns ? titleColumns - 1 : block.titleColumns,
    });
  }

  function updateCount(event: Event & { currentTarget: HTMLInputElement }, key: 'titleColumns' | 'footerRows', max: number) {
    const input = event.currentTarget;
    const count = Math.max(0, Math.min(max, Math.trunc(input.valueAsNumber || 0)));
    input.value = String(count);
    if (count !== (block[key] ?? 0)) change({ [key]: count });
  }
</script>

{#snippet tools()}
<div class="table-tools">
  <button class="button secondary" onclick={paste}><ClipboardPlus size={15} /> Paste range</button>
  <button class="button ghost" title={hotkeyLabel(hotkeys.rowAbove) + ' inserts above, ' + hotkeyLabel(hotkeys.rowBelow) + ' inserts below'} onclick={() => insertRow(dataRows)}><Plus size={15} /> Row</button>
  <button class="button ghost" title={hotkeyLabel(hotkeys.columnLeft) + ' inserts left, ' + hotkeyLabel(hotkeys.columnRight) + ' inserts right'} onclick={() => insertColumn(block.columns.length)}><Plus size={15} /> Column</button>
  <label class="table-style-label">Style
    <select value={block.style} onchange={(event) => change({ style: event.currentTarget.value as TableStyle })}>
      {#each styles as [value, name]}<option {value}>{name}</option>{/each}
    </select>
  </label>
  <label class="table-style-label">Title columns<input type="number" min="0" max={block.columns.length} value={titleColumns}
    onchange={(event) => updateCount(event, 'titleColumns', block.columns.length)} /></label>
  <label class="table-style-label" title="Footer rows are excluded from SQL and charts">Footer rows<input type="number" min="0" max={block.rows.length} value={footerRows}
    onchange={(event) => updateCount(event, 'footerRows', block.rows.length)} /></label>
  <label class="table-style-label">First row
    <select value={block.rowIndexBase ?? 1} onchange={(event) => change({ rowIndexBase: event.currentTarget.value === '0' ? 0 : 1 })}>
      <option value={1}>1</option><option value={0}>0</option>
    </select>
  </label>
</div>
{/snippet}
{#if !inline}{@render tools()}{/if}
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
          <div class="column-heading">
            <span title="Column letter">{columnLetter(index)}</span>
            <input value={column.name} onchange={(event) => updateColumn(index, { name: event.currentTarget.value })} aria-label={'Column ' + (index + 1) + ' name'} />
            <button class="icon-button small" disabled={block.columns.length === 1} aria-label={'Delete column ' + column.name}
              title={'Delete column ' + column.name} onclick={() => deleteColumn(index)}><Trash2 size={12} /></button>
          </div>
          <select value={column.type} onchange={(event) => updateColumn(index, { type: event.currentTarget.value as ColumnType })} aria-label={column.name + ' type'}>
            {#each types as [value, name]}<option {value}>{name}</option>{/each}
          </select>
        </th>
      {/each}
      <th scope="col"><span class="sr-only">Actions</span></th>
    </tr></thead>
    <tbody>{#each block.rows.slice(0, limit) as row, rowIndex (row.id)}
      <tr class:footer-row={rowIndex >= dataRows}><th scope="row" class="row-index">{rowNumber(block, rowIndex)}</th>
        {#each block.columns as column, columnIndex (column.id)}
          {@const id = cellId(row.id, column.id)}
          {@const issue = issueByCell.get(rowIndex + ':' + columnIndex)}
          {@const isFormula = Boolean(row.formulas?.[column.id]) || isFormulaEntry(row.cells[columnIndex] ?? '')}
          {@const showMenu = editing?.id === id && suggestions.length > 0}
          <td class:invalid-cell={Boolean(issue)} class:title-column={columnIndex < titleColumns} class:formula-cell={isFormula}><input
            {id}
            class:numeric={data.columns[columnIndex].type === 'decimal'}
            value={editing?.id === id ? cellDraft : data.display(rowIndex, columnIndex)}
            title={isFormula ? cellFormulaText(row, block.columns, columnIndex, inputs) : undefined}
            aria-label={column.name + ' row ' + rowNumber(block, rowIndex)}
            aria-invalid={issue ? true : undefined}
            aria-describedby={issue ? id + '-error' : undefined}
            aria-autocomplete="list"
            aria-controls={showMenu ? suggestionsId : undefined}
            aria-activedescendant={showMenu ? suggestionsId + '-' + suggestions[activeSuggestion] : undefined}
            autocomplete="off"
            onfocus={(event) => {
              editing = { id, input: event.currentTarget, row: rowIndex, column: columnIndex };
              cellDraft = cellFormulaText(row, block.columns, columnIndex, inputs);
              hideSuggestions = false;
              activeSuggestion = 0;
              if (event.currentTarget.value !== cellDraft) {
                event.currentTarget.value = cellDraft;
                event.currentTarget.select();
              }
            }}
            onblur={() => { if (editing?.id === id) editing = undefined; }}
            oninput={(event) => {
              cellDraft = event.currentTarget.value;
              hideSuggestions = false;
              activeSuggestion = 0;
              updateCell(rowIndex, columnIndex, cellDraft);
            }}
            onkeydown={(event) => cellKeyboard(event, rowIndex, columnIndex)}
            onpaste={(event) => pasteCells(event, rowIndex, columnIndex)}
          />{#if issue}<span id={id + '-error'} class="cell-validation-message">{issue}</span>{/if}</td>
        {/each}
        <td class="row-actions"><button class="icon-button small" aria-label={'Delete row ' + rowNumber(block, rowIndex)} onclick={() => change({
          rows: block.rows.filter((candidate) => candidate.id !== row.id),
          footerRows: rowIndex >= dataRows ? footerRows - 1 : block.footerRows,
        })}><Trash2 size={13} /></button></td>
      </tr>
    {/each}</tbody>
  </table>
  {#if !block.rows.length}<p class="grid-empty">Add a row or paste a range to begin.</p>{/if}
</div>
{#if editing && suggestions.length}
  <FormulaSuggestions anchor={editing.input} id={suggestionsId} choices={suggestions} active={suggestions[activeSuggestion]} pick={completeFormula} />
{/if}
{#if inline}{@render tools()}{/if}
<div class="table-count"><span>{countLabel(block.rows.length, 'row')} · {countLabel(block.columns.length, 'column')}</span>
  {#if block.rows.length > limit}<button class="text-button" onclick={() => limit += 100}>Show more</button>{/if}
</div>
