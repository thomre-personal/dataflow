import { describeCellIssue, tableData } from './table-data.ts';
import { dataRowCount, defaultPreviewRowHeight, defaultTableColumnWidth } from './workspace.ts';
import type { ChartBlock, Result, TableBlock, Workspace } from './workspace.ts';

export const countLabel = (value: number, singular: string, plural = singular + 's') =>
  value.toLocaleString('en') + ' ' + (value === 1 ? singular : plural);

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
  const rows = table.rows.slice(0, limit);
  return {
    columns: data.columns,
    rows: rows.map((_, row) => data.columns.map((_, column) => data.display(row, column) || null)),
    tableStyle: table.style,
    titleColumns: table.titleColumns,
    footerRows: Math.max(0, Math.min(limit, table.rows.length) - dataRowCount(table)),
    columnWidths: table.columnWidths && table.columns.map(({ id }) => table.columnWidths?.[id] ?? defaultTableColumnWidth),
    rowHeights: table.rowHeights && rows.map(({ id }) => Math.max(defaultPreviewRowHeight, table.rowHeights?.[id] ?? 0)),
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
