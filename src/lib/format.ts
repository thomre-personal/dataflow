import { describeCellIssue, validateCell } from './clipboard';
import type { ChartBlock, Result, TableBlock } from './workspace';

export const countLabel = (value: number, singular: string, plural = singular + 's') =>
  value.toLocaleString('en') + ' ' + (value === 1 ? singular : plural);

export function tableResult(table: TableBlock): Result {
  return {
    columns: table.columns.map(({ name, type }) => ({ name, type })),
    rows: table.rows.map((row, rowIndex) => table.columns.map((column, index) => {
      const cell = validateCell(row.cells[index] ?? '', column.type, table.numberFormat);
      if (cell.message !== undefined) throw new Error(describeCellIssue(table, { row: rowIndex, column: index, message: cell.message }));
      return cell.value;
    })),
  };
}

export function tablePreview(table: TableBlock, limit: number): Result {
  return {
    columns: table.columns,
    rows: table.rows.slice(0, limit).map((row) => row.cells.map((cell) => cell || null)),
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
