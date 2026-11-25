import { describeCellIssue, tableData } from './table-data.ts';
import { cellFontLineHeight } from './cell-style.ts';
import { evaluateConfigField } from './config.ts';
import { dataRowCount, defaultPreviewRowHeight, defaultTableColumnWidth } from './workspace.ts';
import type { ChartBlock, ConfigBlock, Result, TableBlock, Workspace } from './workspace.ts';

export const countLabel = (value: number, singular: string, plural = singular + 's') =>
  value.toLocaleString('en') + ' ' + (value === 1 ? singular : plural);

export function configResult(block: ConfigBlock): Result {
  if (!block.fields.length) throw new Error('Add at least one field to ' + block.title + '.');
  const fields = block.fields.map((field) => {
    const evaluated = evaluateConfigField(field);
    if (evaluated.message !== undefined) throw new Error(block.title + ', ' + field.name + ': ' + evaluated.message);
    return { column: { name: field.name, type: evaluated.type }, value: evaluated.value };
  });
  return { columns: fields.map(({ column }) => column), rows: [fields.map(({ value }) => value)] };
}

export function tableResult(table: TableBlock, workspace?: Workspace): Result {
  const data = tableData(table, workspace);
  return {
    columns: data.columns.map(({ name, type }) => ({ name, type })),
    rows: table.rows.slice(0, dataRowCount(table)).map((_, rowIndex) => data.columns.map((_, index) => {
      const cell = data.cell(rowIndex, index);
      if (cell.message !== undefined) throw new Error(describeCellIssue(table, { row: rowIndex, column: index, message: cell.message }));
      return cell.value;
    })),
  };
}

export function tablePreview(table: TableBlock, limit: number, workspace?: Workspace): Result {
  const data = tableData(table, workspace);
  const dataRows = dataRowCount(table);
  const footerRows = table.rows.length - dataRows;
  const rows = [
    ...table.rows.slice(0, Math.min(dataRows, Math.max(0, limit - footerRows))).map((row, index) => ({ row, index })),
    ...table.rows.slice(dataRows).map((row, offset) => ({ row, index: dataRows + offset })),
  ];
  const cellStyles = table.cellStyles && Object.fromEntries(rows.flatMap(({ row: { id } }, index) => {
    const styles = table.cellStyles?.[id];
    if (!styles) return [];
    return [[index, Object.fromEntries(table.columns.flatMap(({ id }, column) => styles[id] ? [[column, styles[id]]] : []))]];
  }));
  return {
    columns: data.columns,
    rows: rows.map(({ index }) => data.columns.map((_, column) => data.display(index, column) || null)),
    tableStyle: table.style,
    titleColumns: table.titleColumns,
    footerRows,
    columnWidths: table.columnWidths && table.columns.map(({ id }) => table.columnWidths?.[id] ?? defaultTableColumnWidth),
    rowHeights: (table.rowHeights || cellStyles) && rows.map(({ row: { id } }, row) => Math.max(defaultPreviewRowHeight,
      table.rowHeights?.[id] ?? 0, ...Object.values(cellStyles?.[row] ?? {}).map((style) => cellFontLineHeight(style.fontSize ?? 0) + 1))),
    cellStyles,
  };
}

export function chartSeries(block: ChartBlock, result: Result | undefined) {
  if (!result) return undefined;
  const x = block.x ? result.columns.findIndex((column) => column.name === block.x) : result.columns.length === 1 ? -1 : 0;
  const y = block.y ? result.columns.findIndex((column) => column.name === block.y)
    : result.columns.findIndex((column, index) => index !== x && column.type === 'decimal');
  if ((block.x && x < 0) || y < 0) return undefined;
  const plotted = result.rows.slice(0, 100);
  const values = plotted.map((row) => {
    const value = row[y];
    return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
  });
  if (!values.some((value) => value !== null)) return undefined;
  return {
    labels: plotted.map((row, index) => {
      if (x < 0) return String(index + 1);
      const label = row[x] ?? '—';
      const month = /^(\d{4})-(\d{2})$/.exec(label);
      if (!month || Number(month[2]) < 1 || Number(month[2]) > 12) return label;
      const short = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' })
        .format(new Date(month[1] + '-' + month[2] + '-01T00:00:00Z'));
      return short + ' ' + month[1].slice(2);
    }),
    values,
    label: result.columns[y].name,
    truncated: result.rows.length > plotted.length,
  };
}
