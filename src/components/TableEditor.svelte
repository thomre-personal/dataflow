<script lang="ts">
  import { CircleAlert, ClipboardPlus, Plus, Trash2 } from 'lucide-svelte';
  import { tick } from 'svelte';
  import { columnLetter, dataRowCount, defaultTableColumnWidth, newId, rowNumber, tableInputs } from '../lib/workspace';
  import { countLabel } from '../lib/format';
  import { copyGrid, MAX_COLUMNS, MAX_ROWS, parseDelimited, readCopiedGrid } from '../lib/clipboard';
  import { bindCellFormula, cellFormulaText, isFormulaEntry, suggestFunctions } from '../lib/formulas';
  import { cellSelectionBounds, cellStyleCss } from '../lib/cell-style';
  import type { CellAddress, CellSelection } from '../lib/cell-style';
  import { describeCellIssue, invalidTableCells, tableData } from '../lib/table-data';
  import { eventHotkey, hotkeyLabel } from '../lib/preferences';
  import type { Hotkeys } from '../lib/preferences';
  import { tableCardContentSize } from '../lib/table-layout';
  import type { Column, ColumnType, Formula, TableBlock, TableStyle, Workspace } from '../lib/workspace';
  import FormulaSuggestions from './FormulaSuggestions.svelte';
  import Modal from './Modal.svelte';

  let { block, workspace, hotkeys, change, paste, error, activeCell, selectCell, inline = false }: {
    block: TableBlock;
    workspace: Workspace;
    hotkeys: Hotkeys;
    change: (patch: Partial<TableBlock>) => void;
    paste: () => void;
    error: (message: string) => void;
    activeCell?: CellSelection;
    selectCell: (cell: CellSelection, extend?: boolean) => void;
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
  let editing = $state<{ id: string; input: HTMLTextAreaElement; row: number; column: number }>();
  let cellDraft = $state('');
  let hideSuggestions = $state(false);
  let activeSuggestion = $state(0);
  let suggestions = $derived(editing && !hideSuggestions ? suggestFunctions(cellDraft) : []);
  let issues = $derived([...invalidTableCells(block, data)].filter((issue) =>
    issue.row !== editing?.row || issue.column !== editing.column || !isFormulaEntry(cellDraft)));
  let issueByCell = $derived(new Map(issues.map((issue) => [issue.row + ':' + issue.column, issue.message])));
  let cellAnchor = $derived(activeCell?.axis ? undefined : activeCell);
  let bounds = $derived(cellSelectionBounds(block, activeCell));
  let range = $derived(activeCell?.axis || cellAnchor?.end ? bounds : undefined);
  let columnSettings = $state<Column>();
  let columnSettingsTrigger: HTMLButtonElement | undefined;
  let settingsColumnIndex = $derived(block.columns.findIndex(({ id }) => id === columnSettings?.id));
  const rowIndexWidth = 35;
  const rowActionsWidth = 30;
  let table = $state<HTMLTableElement>();
  let cellDrag: { pointer: number; end: HTMLTableCellElement; editOnRelease: boolean } | undefined;
  type Resize = { id: string; pointer: number; start: number; scale: number; initial: number; size: number; min: number; widths?: Record<string, number> };
  let resizing = $state<Resize>();
  let columnWidths = $derived(resizing?.widths && resizing.size !== resizing.initial
    ? { ...resizing.widths, [resizing.id]: resizing.size } : block.columnWidths);
  let gridWidth = $derived(rowIndexWidth + rowActionsWidth + block.columns.reduce((width, column) =>
    width + (columnWidths?.[column.id] ?? defaultTableColumnWidth), 0));

  const editorId = $props.id();
  const suggestionsId = editorId + '-formulas';
  const settingsFormId = editorId + '-column-settings';
  const cellId = (rowId: string, columnId: string) => editorId + '-cell-' + rowId + '-' + columnId;

  function renderedColumnWidths() {
    const headers = table?.tHead?.rows[0].cells;
    return Object.fromEntries(block.columns.map(({ id }, index) => {
      const header = headers?.[index + 1];
      return [id, header ? parseFloat(getComputedStyle(header).width) : defaultTableColumnWidth];
    }));
  }

  function rowHeight(id: string) {
    return resizing?.id === id && !resizing.widths && resizing.size !== resizing.initial
      ? resizing.size : block.rowHeights?.[id];
  }

  function startResize(event: PointerEvent & { currentTarget: HTMLButtonElement }, id: string, column: boolean) {
    if (event.button !== 0 || resizing || !table) return;
    const row = event.currentTarget.closest('tr');
    if (!row) return;
    const bounds = table.getBoundingClientRect();
    const scale = bounds.width / table.offsetWidth;
    const widths = column ? renderedColumnWidths() : undefined;
    const initial = widths?.[id] ?? row.offsetHeight;
    let min = defaultTableColumnWidth;
    if (!column) {
      const height = row.style.height;
      row.style.height = '';
      min = row.offsetHeight;
      row.style.height = height;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizing = {
      id, pointer: event.pointerId, start: column ? event.clientX : event.clientY,
      scale, initial, size: initial, min, widths,
    };
  }

  function moveResize(event: PointerEvent) {
    if (resizing?.pointer !== event.pointerId) return;
    const position = resizing.widths ? event.clientX : event.clientY;
    resizing.size = Math.max(resizing.min, resizing.initial + Math.round((position - resizing.start) / resizing.scale));
  }

  function endResize(event: PointerEvent, save = false) {
    if (resizing?.pointer !== event.pointerId) return;
    if (save) moveResize(event);
    const { id, initial, size, widths } = resizing;
    resizing = undefined;
    if (!save || size === initial) return;
    if (widths) resizeColumns({ ...widths, [id]: size });
    else {
      const row = (event.currentTarget as HTMLElement).closest('tr');
      resizeGrid({ rowHeights: { ...block.rowHeights, [id]: size } }, undefined, size - (row?.offsetHeight ?? initial));
    }
  }

  function resizeColumns(widths: Record<string, number>) {
    const width = rowIndexWidth + rowActionsWidth + block.columns.reduce((sum, { id }) => sum + (widths[id] ?? defaultTableColumnWidth), 0);
    resizeGrid({ columnWidths: widths }, width);
  }

  function resizeGrid(patch: Partial<TableBlock>, width?: number, rowDelta = 0) {
    const card = inline ? table?.closest<HTMLElement>('.graph-card.table') : undefined;
    const needed = card && tableCardContentSize(card, width, rowDelta);
    if (card && needed) {
      const next = {
        width: width === undefined ? card.offsetWidth : Math.max(card.offsetWidth, needed.width),
        height: width === undefined ? Math.max(card.offsetHeight, needed.height) : card.offsetHeight,
      };
      if (next.width !== card.offsetWidth || next.height !== card.offsetHeight) patch.expandedSize = next;
    }
    change(patch);
  }

  function withoutEntry<T>(entries: Record<string, T> | undefined, id: string) {
    if (!entries || !Object.hasOwn(entries, id)) return entries;
    const next = { ...entries };
    delete next[id];
    return Object.keys(next).length ? next : undefined;
  }

  function fitColumn(id: string, index: number) {
    const header = table?.tHead?.rows[0].cells[index + 1];
    const name = header?.querySelector<HTMLElement>('.column-name');
    if (!header || !name) return;
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    const heading = getComputedStyle(name);
    context.font = heading.font;
    const padding = (style: CSSStyleDeclaration) => parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    let width = Math.max(defaultTableColumnWidth, context.measureText(name.textContent ?? '').width
      + padding(heading) + header.offsetWidth - name.offsetWidth);
    const sample = table?.tBodies[0]?.rows[0]?.cells[index + 1]?.querySelector('textarea');
    if (sample && table) {
      const style = getComputedStyle(sample);
      const space = padding(style) + 2;
      const defaults = getComputedStyle(table);
      for (let row = 0; row < block.rows.length; row++) {
        const format = block.cellStyles?.[block.rows[row].id]?.[id];
        const weight = format?.bold === undefined ? index < titleColumns || row >= dataRows ? '650' : defaults.fontWeight
          : format.bold ? '700' : '400';
        const size = format?.fontSize ? format.fontSize + 'px' : defaults.fontSize;
        context.font = `${format?.italic ? 'italic' : 'normal'} ${weight} ${size} ${format?.fontFamily ?? defaults.fontFamily}`;
        for (const line of data.display(row, index).split(/\r\n?|\n/)) {
          width = Math.max(width, context.measureText(line).width + space);
        }
      }
    }
    const widths = renderedColumnWidths();
    const size = Math.ceil(width);
    if (size !== block.columnWidths?.[id] && Math.abs(size - widths[id]) >= 1) {
      resizeColumns({ ...widths, [id]: size });
    }
  }

  function fitRow(id: string) {
    if (block.rowHeights?.[id] !== undefined) change({ rowHeights: withoutEntry(block.rowHeights, id) });
  }

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

  function clearSelectedCells() {
    const selection = bounds;
    if (!selection) return;
    let changed = false;
    const rows = block.rows.map((row, index) => {
      if (index < selection.top || index > selection.bottom) return row;
      const formulas = { ...row.formulas };
      let cells: string[] | undefined;
      for (let column = selection.left; column <= selection.right; column++) {
        const id = block.columns[column].id;
        if (row.cells[column] === '' && !formulas[id]) continue;
        cells ??= [...row.cells];
        cells[column] = '';
        delete formulas[id];
      }
      if (!cells) return row;
      changed = true;
      return { ...row, cells, formulas };
    });
    if (changed) change({ rows });
  }

  function copyCells(event: ClipboardEvent) {
    const selection = bounds;
    if (event.target !== event.currentTarget || !selection || !event.clipboardData) return;
    if (event.currentTarget instanceof HTMLButtonElement && event.currentTarget.ariaPressed !== 'true') return;
    const rows = block.rows.slice(selection.top, selection.bottom + 1);
    const columns = block.columns.slice(selection.left, selection.right + 1);
    copyGrid(event.clipboardData, rows.map((row) => columns.map((column, index) => ({
      text: cellFormulaText(row, block.columns, selection.left + index, inputs),
      style: block.cellStyles?.[row.id]?.[column.id],
    }))));
    event.preventDefault();
  }

  function pasteCells(event: ClipboardEvent, firstRow: number, firstColumn: number, wholeCell = false) {
    const clipboard = event.clipboardData;
    if (!clipboard || (wholeCell && event.target !== event.currentTarget)) return;
    const text = clipboard.getData('text/plain');
    const copied = wholeCell ? readCopiedGrid(clipboard) : undefined;
    const delimited = /[\t\r\n]/.test(text);
    if (!copied && !delimited && (!wholeCell || !clipboard.types.includes('text/plain'))) return;
    event.preventDefault();
    try {
      const grid = copied ? copied.map((row) => row.map((cell) => cell.text)) : delimited ? parseDelimited(text) : [[text]];
      const width = Math.max(block.columns.length, firstColumn + (grid[0]?.length ?? 0));
      const intoFooter = footerRows > 0 && firstRow >= dataRows;
      const boundary = intoFooter ? block.rows.length : dataRows;
      const addedRows = Math.max(0, firstRow + grid.length - boundary);
      const height = block.rows.length + addedRows;
      if (width > MAX_COLUMNS || height > MAX_ROWS) throw new Error('The pasted range would exceed the table size limit.');
      const columns = Array.from({ length: width }, (_, i) => block.columns[i]
        ?? { id: newId(), name: columnLetter(i), type: 'auto' as const });
      const cellStyles = copied ? { ...block.cellStyles } : block.cellStyles;
      const rows = Array.from({ length: height }, (_, rowIndex) => {
        const existing = rowIndex < boundary ? block.rows[rowIndex] :
          rowIndex >= boundary + addedRows ? block.rows[rowIndex - addedRows] : undefined;
        const formulas = { ...existing?.formulas };
        const cells = Array.from({ length: width }, (_, columnIndex) => {
          const pasted = grid[rowIndex - firstRow]?.[columnIndex - firstColumn];
          if (pasted !== undefined) bindCellFormula(formulas, columns, columnIndex, pasted, inputs);
          return pasted ?? existing?.cells[columnIndex] ?? '';
        });
        const id = existing?.id ?? newId();
        const pasted = copied?.[rowIndex - firstRow];
        if (pasted && cellStyles) {
          const styles = { ...cellStyles[id] };
          for (const [index, cell] of pasted.entries()) {
            const columnId = columns[firstColumn + index].id;
            if (cell.style) styles[columnId] = cell.style;
            else delete styles[columnId];
          }
          if (Object.keys(styles).length) cellStyles[id] = styles;
          else delete cellStyles[id];
        }
        return { id, cells, formulas };
      });
      change({ columns, rows, cellStyles, footerRows: intoFooter ? footerRows + addedRows : block.footerRows });
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

  function cellKeyboard(event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }, row: number, column: number) {
    if (event.isComposing) return;
    const shiftOnly = event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
    if (shiftOnly && event.key === 'Enter') {
      event.stopPropagation();
      return;
    }
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
      event.currentTarget.closest('td')?.focus({ preventScroll: true });
    } else {
      insertWithShortcut(event, row, column);
    }
  }

  function cellPointer(event: PointerEvent & { currentTarget: HTMLTableCellElement }, address: CellAddress) {
    if (event.button !== 0 || cellDrag) return;
    const cell = event.currentTarget;
    if (event.shiftKey && cellAnchor) {
      event.preventDefault();
      document.getElementById(cellId(cellAnchor.rowId, cellAnchor.columnId))?.closest('td')?.focus({ preventScroll: true });
      selectCell(address, true);
      return;
    }
    if (editing && event.target === editing.input) return;

    const isAnchor = cellAnchor?.rowId === address.rowId && cellAnchor.columnId === address.columnId;
    event.preventDefault();
    cell.setPointerCapture(event.pointerId);
    cellDrag = { pointer: event.pointerId, end: cell, editOnRelease: isAnchor && !cellAnchor?.end };
    if (!cellDrag.editOnRelease && (isAnchor || document.activeElement === cell)) selectCell(address);
    cell.focus({ preventScroll: true });
  }

  function extendCellDrag(event: PointerEvent) {
    const drag = cellDrag;
    if (drag?.pointer !== event.pointerId) return;
    // Pointer capture keeps events on the starting cell, so find the cell under the pointer.
    const cell = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLTableCellElement>('td[data-table-cell]');
    if (!cell || cell.closest('table') !== table) return;
    if (cell !== drag.end && cell.parentElement instanceof HTMLTableRowElement) {
      const row = block.rows[cell.parentElement.sectionRowIndex];
      const column = block.columns[cell.cellIndex - 1];
      if (row && column) {
        drag.end = cell;
        drag.editOnRelease = false;
        selectCell({ rowId: row.id, columnId: column.id }, true);
      }
    }
    return cell;
  }

  function endCellDrag(event: PointerEvent) {
    const drag = cellDrag;
    if (drag?.pointer !== event.pointerId) return;
    if (event.type === 'pointerup' && extendCellDrag(event) && drag.editOnRelease) {
      drag.end.querySelector('textarea')?.focus({ preventScroll: true });
    }
    cellDrag = undefined;
  }

  function clearSelectionWithKey(event: KeyboardEvent) {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || (event.key !== 'Delete' && event.key !== 'Backspace')) return false;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) clearSelectedCells();
    return true;
  }

  function selectionKeyboard(event: KeyboardEvent & { currentTarget: HTMLTableCellElement }, row: number, column: number) {
    if (event.target !== event.currentTarget || event.isComposing || clearSelectionWithKey(event)) return;
    const plain = !event.altKey && !event.ctrlKey && !event.metaKey;
    if (plain && (event.key === 'Enter' || event.key === 'F2' || event.key.length === 1)) {
      const input = event.currentTarget.querySelector('textarea');
      if (!input) return;
      event.preventDefault();
      event.stopPropagation();
      input.focus({ preventScroll: true });
      if (event.key.length === 1) {
        input.value = cellDraft = event.key;
        updateCell(row, column, cellDraft);
      }
    } else {
      insertWithShortcut(event, row, column);
    }
  }

  function headerSelectionKeyboard(event: KeyboardEvent & { currentTarget: HTMLButtonElement }) {
    if (event.currentTarget.ariaPressed === 'true') clearSelectionWithKey(event);
  }

  function selectHeader(button: HTMLButtonElement, selection: CellSelection) {
    button.focus({ preventScroll: true });
    selectCell(selection);
  }

  function columnHeaderKeyboard(event: KeyboardEvent & { currentTarget: HTMLButtonElement }, column: Column) {
    if (event.key !== 'F2' || event.isComposing) {
      headerSelectionKeyboard(event);
      return;
    }
    event.preventDefault();
    if (event.repeat) return;
    selectCell({ axis: 'column', columnId: column.id });
    openColumnSettings(column, event.currentTarget);
  }

  function openColumnSettings(column: Column, trigger: HTMLButtonElement) {
    columnSettingsTrigger = trigger;
    columnSettings = { ...column };
  }

  async function closeColumnSettings() {
    const trigger = columnSettingsTrigger;
    columnSettingsTrigger = undefined;
    columnSettings = undefined;
    await tick();
    trigger?.focus({ preventScroll: true });
  }

  function saveColumnSettings(event: SubmitEvent) {
    event.preventDefault();
    const draft = columnSettings;
    const current = block.columns[settingsColumnIndex];
    if (draft && current && (current.name !== draft.name || current.type !== draft.type)) {
      change({ columns: block.columns.map((column) => column.id === draft.id ? { ...column, name: draft.name, type: draft.type } : column) });
    }
    void closeColumnSettings();
  }

  function deleteColumn(index: number) {
    if (block.columns.length <= 1) return;
    const columnId = block.columns[index].id;
    const cellStyles = block.cellStyles && Object.fromEntries(Object.entries(block.cellStyles).flatMap(([id, styles]) => {
      const remaining = withoutEntry(styles, columnId);
      return remaining ? [[id, remaining]] : [];
    }));
    change({
      columns: block.columns.filter((column) => column.id !== columnId),
      columnWidths: withoutEntry(block.columnWidths, columnId),
      cellStyles: cellStyles && Object.keys(cellStyles).length ? cellStyles : undefined,
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

{#snippet resizeHandle(id: string, label: string, fit: () => void, column = false)}
  <button type="button" class="table-resize-handle nodrag nopan" class:column-resize={column}
    class:row-resize={!column} class:resizing={resizing?.id === id}
    aria-label={label} title={label + ' · Double-click to fit'}
    onpointerdown={(event) => startResize(event, id, column)} onpointermove={moveResize}
    onpointerup={(event) => endResize(event, true)} onlostpointercapture={endResize}
    onclick={(event) => { event.stopPropagation(); if (event.detail === 0) fit(); }}
    ondblclick={(event) => { event.stopPropagation(); fit(); }}>
  </button>
{/snippet}

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
<div class="table-editor-content">
{#if !inline}{@render tools()}{/if}
{#if issues.length}
  {@const first = issues[0]}
  <div class="table-validation" role="status">
    <CircleAlert size={16} />
    <div><strong>{countLabel(issues.length, 'invalid cell')}</strong><p>{describeCellIssue(block, first)}</p></div>
    <button class="text-button" onclick={() => void focusCell(first.row, block.rows[first.row].id, block.columns[first.column].id)}>Go to cell</button>
  </div>
{/if}
<div class="editor-grid" data-table-style={block.style}>
  <table bind:this={table} style:min-width={gridWidth + 'px'} style:width={columnWidths ? gridWidth + 'px' : undefined}
    onpointermove={extendCellDrag} onpointerup={endCellDrag} onlostpointercapture={endCellDrag}>
    <colgroup>
      <col style:width={rowIndexWidth + 'px'} />
      {#each block.columns as column (column.id)}
        <col style:width={columnWidths ? (columnWidths[column.id] ?? defaultTableColumnWidth) + 'px' : undefined} />
      {/each}
      <col style:width={rowActionsWidth + 'px'} />
    </colgroup>
    <thead><tr><th scope="col" class="row-index">#</th>
      {#each block.columns as column, index (column.id)}
        {@const letter = columnLetter(index)}
        <th scope="col" class:title-column={index < titleColumns}>
          <button type="button" class="table-header-select column-select nokey" data-table-selection=""
            aria-label={'Select column ' + column.name} aria-pressed={activeCell?.axis === 'column' && activeCell.columnId === column.id}
            title={'Double-click or press F2 to edit column ' + column.name}
            onclick={(event) => selectHeader(event.currentTarget, { axis: 'column', columnId: column.id })}
            ondblclick={(event) => openColumnSettings(column, event.currentTarget)}
            onkeydown={(event) => columnHeaderKeyboard(event, column)} oncopy={copyCells}>
            <span class="column-heading">
              {#if letter !== column.name}<span class="column-letter">{letter}</span>{/if}
              <span class="column-name">{column.name || letter}</span>
            </span>
            <span class="column-type">{types.find(([type]) => type === column.type)?.[1]}</span>
          </button>
          {@render resizeHandle(column.id, 'Resize column ' + column.name, () => fitColumn(column.id, index), true)}
        </th>
      {/each}
      <th scope="col"><span class="sr-only">Actions</span></th>
    </tr></thead>
    <tbody>{#each block.rows.slice(0, limit) as row, rowIndex (row.id)}
      {@const height = rowHeight(row.id)}
      <tr class:footer-row={rowIndex >= dataRows} style:height={height === undefined ? undefined : height + 'px'}>
        <th scope="row" class="row-index">
          <button type="button" class="table-header-select row-select nokey" data-table-selection=""
            aria-label={'Select row ' + rowNumber(block, rowIndex)} aria-pressed={activeCell?.axis === 'row' && activeCell.rowId === row.id}
            onclick={(event) => selectHeader(event.currentTarget, { axis: 'row', rowId: row.id })}
            onkeydown={headerSelectionKeyboard} oncopy={copyCells}>
            {rowNumber(block, rowIndex)}
          </button>
          {@render resizeHandle(row.id, 'Resize row ' + rowNumber(block, rowIndex), () => fitRow(row.id))}
        </th>
        {#each block.columns as column, columnIndex (column.id)}
          {@const id = cellId(row.id, column.id)}
          {@const issue = issueByCell.get(rowIndex + ':' + columnIndex)}
          {@const isFormula = Boolean(row.formulas?.[column.id]) || isFormulaEntry(row.cells[columnIndex] ?? '')}
          {@const showMenu = editing?.id === id && suggestions.length > 0}
          {@const value = editing?.id === id ? cellDraft : data.display(rowIndex, columnIndex)}
          {@const inRange = range && rowIndex >= range.top && rowIndex <= range.bottom && columnIndex >= range.left && columnIndex <= range.right}
          {@const address = { rowId: row.id, columnId: column.id }}
          {@const active = cellAnchor?.rowId === row.id && cellAnchor.columnId === column.id}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex (Cells can be selected with the keyboard before entering edit mode.) -->
          <td data-table-cell="" class="nokey" tabindex="0" class:invalid-cell={Boolean(issue)} class:title-column={columnIndex < titleColumns}
            class:formula-cell={isFormula} class:range-cell={inRange} class:selected-cell={active}
            onfocus={() => { if (!active) selectCell(address); }}
            onpointerdown={(event) => cellPointer(event, address)}
            onkeydown={(event) => selectionKeyboard(event, rowIndex, columnIndex)}
            oncopy={copyCells} onpaste={(event) => pasteCells(event, rowIndex, columnIndex, true)}
            style={cellStyleCss(block.cellStyles?.[row.id]?.[column.id])}>
            <div class="cell-editor" data-value={value + '\u200b'}><textarea
            {id}
            data-table-cell=""
            tabindex="-1"
            class:editing-cell={editing?.id === id}
            class:numeric={data.columns[columnIndex].type === 'decimal'}
            {value}
            rows={value.split(/\r\n?|\n/).length}
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
              if (!active || cellAnchor?.end) selectCell(address);
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
            ></textarea></div>{#if issue}<span id={id + '-error'} class="cell-validation-message">{issue}</span>{/if}</td>
        {/each}
        <td class="row-actions"><button class="icon-button small" aria-label={'Delete row ' + rowNumber(block, rowIndex)} onclick={() => change({
          rows: block.rows.filter((candidate) => candidate.id !== row.id),
          rowHeights: withoutEntry(block.rowHeights, row.id),
          cellStyles: withoutEntry(block.cellStyles, row.id),
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
{#if columnSettings && settingsColumnIndex >= 0}
  {@const draft = columnSettings}
  {#snippet settingsFields()}
    <form id={settingsFormId} onsubmit={saveColumnSettings}>
      <label class="field">Name
        <!-- svelte-ignore a11y_autofocus (The user explicitly opens column settings to edit them.) -->
        <input bind:value={draft.name} autofocus />
      </label>
      <label class="field">Data type
        <select bind:value={draft.type}>
          {#each types as [value, name]}<option {value}>{name}</option>{/each}
        </select>
      </label>
    </form>
  {/snippet}
  {#snippet settingsFooter()}
    <button type="button" class="button ghost column-delete" disabled={block.columns.length === 1}
      aria-label={'Delete column ' + block.columns[settingsColumnIndex].name}
      onclick={() => { deleteColumn(settingsColumnIndex); void closeColumnSettings(); }}><Trash2 size={15} /> Delete column</button>
    <button type="button" class="button secondary" onclick={closeColumnSettings}>Cancel</button>
    <button type="submit" class="button primary" form={settingsFormId}>Save</button>
  {/snippet}
  <Modal className="column-settings-dialog" title="Column settings" subtitle={'Column ' + columnLetter(settingsColumnIndex)}
    close={closeColumnSettings} children={settingsFields} footer={settingsFooter} />
{/if}
{#if inline}{@render tools()}{/if}
<div class="table-count"><span>{countLabel(block.rows.length, 'row')} · {countLabel(block.columns.length, 'column')}</span>
  {#if block.rows.length > limit}<button class="text-button" onclick={() => limit += 100}>Show more</button>{/if}
</div>
</div>
