import { inferType, parseDecimal, validateCell } from './clipboard.ts';
import { columnLetter, dataRowCount, rowNumber } from './workspace.ts';
import type { Column, Row, SumFormula, TableBlock } from './workspace.ts';

type CellIssue = { row: number; column: number; message: string };
const sumPrefix = /^=\s*SUM\b/i;
const sumPattern = /^=\s*SUM\s*\((.*)\)\s*$/i;

function bindSum(value: string, columns: Column[], index: number): SumFormula | undefined {
  const argument = sumPattern.exec(value.trim())?.[1]?.trim();
  if (argument === undefined) return undefined;
  if (!argument) return { columnId: columns[index].id, reference: 'implicit' };
  const matches = columns.filter((column) => column.name.toLowerCase() === argument.toLowerCase());
  if (matches.length === 1) return { columnId: matches[0].id, reference: 'name' };
  if (matches.length > 1) return undefined;
  const byLetter = columns.findIndex((_, position) => columnLetter(position) === argument.toUpperCase());
  return byLetter < 0 ? undefined : { columnId: columns[byLetter].id, reference: 'letter' };
}

export function bindCellFormula(formulas: NonNullable<Row['formulas']>, columns: Column[], index: number, value: string) {
  const binding = bindSum(value, columns, index);
  if (binding) formulas[columns[index].id] = binding;
  else delete formulas[columns[index].id];
}

export function bindImportedFormulas(data: { columns: Column[]; rows: Row[] }) {
  return {
    ...data,
    rows: data.rows.map((row) => {
      const formulas: NonNullable<Row['formulas']> = {};
      row.cells.forEach((value, index) => {
        if (sumPrefix.test(value.trim())) bindCellFormula(formulas, data.columns, index, value);
      });
      return Object.keys(formulas).length ? { ...row, formulas } : row;
    }),
  };
}

export function cellFormulaText(row: Row, columns: Column[], index: number) {
  const value = row.cells[index] ?? '';
  const formula = row.formulas?.[columns[index].id];
  if (!formula) return value;
  const source = columns.findIndex((column) => column.id === formula.columnId);
  if (source < 0) return value;
  const reference = formula.reference === 'implicit' ? '' : formula.reference === 'letter' ? columnLetter(source) : columns[source].name;
  return '=SUM(' + reference + ')';
}

type CellValue = { value: string; calculated?: boolean; message?: string };

export function tableData(table: TableBlock) {
  const rowCount = dataRowCount(table);
  const indices = new Map(table.columns.map((column, index) => [column.id, index]));
  const totals = new Map<number, CellValue>();
  const summing = new Set<number>();

  function read(row: number, column: number): CellValue {
    const item = table.rows[row];
    const value = item.cells[column] ?? '';
    const formula = item.formulas?.[table.columns[column].id];
    if (formula) {
      const source = indices.get(formula.columnId);
      return source === undefined ? { value, message: 'The referenced column was deleted.' } : total(source);
    }
    if (!sumPrefix.test(value.trim())) return { value };
    const message = sumPattern.test(value.trim()) ? 'Choose a unique column name or letter for SUM.' : 'Use =SUM() or =SUM(Column).';
    return { value, message };
  }

  function total(column: number): CellValue {
    const cached = totals.get(column);
    if (cached) return cached;
    if (summing.has(column)) return { value: '', message: 'This sum refers to itself.' };
    summing.add(column);
    let sum = 0n;
    let scale = 0;
    const type = table.columns[column].type;
    if (type === 'auto' || type === 'decimal') {
      for (let row = 0; row < rowCount; row++) {
        const cell = read(row, column);
        if (cell.message) {
          summing.delete(column);
          totals.set(column, cell);
          return cell;
        }
        if (type === 'auto' && !cell.calculated && /^0\d+$/.test(cell.value.trim())) continue;
        const normalized = cell.calculated ? cell.value : parseDecimal(cell.value, table.numberFormat);
        if (normalized === null) continue;
        const fraction = normalized.split('.')[1]?.length ?? 0;
        const nextScale = Math.max(scale, fraction);
        sum = sum * 10n ** BigInt(nextScale - scale) + BigInt(normalized.replace('.', '')) * 10n ** BigInt(nextScale - fraction);
        scale = nextScale;
      }
    }
    summing.delete(column);
    const digits = (sum < 0 ? -sum : sum).toString().padStart(scale + 1, '0');
    const value = (sum < 0 ? '-' : '') + (scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits);
    const result = { value, calculated: true };
    totals.set(column, result);
    return result;
  }

  function display(row: number, column: number) {
    const cell = read(row, column);
    if (cell.message) return '#ERROR';
    return cell.calculated && table.numberFormat === 'decimal-comma' ? cell.value.replace('.', ',') : cell.value;
  }

  const columns = table.columns.map((column, index) => ({
    ...column,
    type: column.type === 'auto' ? inferType(Array.from({ length: rowCount }, (_, row) => {
      const cell = read(row, index);
      return cell.message ? '' : display(row, index);
    }), table.numberFormat) : column.type,
  }));

  function cell(row: number, column: number) {
    const value = read(row, column);
    return value.message ? { message: value.message } : validateCell(value.value, columns[column].type, value.calculated ? 'decimal-point' : table.numberFormat);
  }

  return { columns, cell, display };
}

export function* invalidTableCells(table: TableBlock, data = tableData(table)): Generator<CellIssue, void> {
  for (let row = 0; row < table.rows.length; row++) {
    for (let column = 0; column < table.columns.length; column++) {
      const { message } = data.cell(row, column);
      if (message) yield { row, column, message };
    }
  }
}

export function describeCellIssue(table: TableBlock, issue: CellIssue): string {
  return table.title + ', row ' + rowNumber(table, issue.row) + ', ' + table.columns[issue.column].name + ': ' + issue.message;
}
