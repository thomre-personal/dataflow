import { inferType, parseDate, parseDecimal, validateCell } from './clipboard.ts';
import { isFormulaEntry, parseFormula, readFormula } from './formulas.ts';
import { dataRowCount, rowNumber } from './workspace.ts';
import type { Formula, OrderedFunction, TableBlock } from './workspace.ts';

type CellIssue = { row: number; column: number; message: string };
type CellValue = { value: string; calculated?: 'number' | 'date' | 'text'; forcedText?: boolean; message?: string };
type Decimal = { units: bigint; scale: number };

function decimal(value: string): Decimal {
  return { units: BigInt(value.replace('.', '')), scale: value.split('.')[1]?.length ?? 0 };
}

function atScale(value: Decimal, scale: number) {
  return value.units * 10n ** BigInt(scale - value.scale);
}

function decimalText({ units, scale }: Decimal) {
  const digits = (units < 0 ? -units : units).toString().padStart(scale + 1, '0');
  return (units < 0 ? '-' : '') + (scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits);
}

function compactDecimal(text: string) {
  return text.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

function compareDecimals(first: Decimal, second: Decimal) {
  const scale = Math.max(first.scale, second.scale);
  const difference = atScale(first, scale) - atScale(second, scale);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function mean(sum: Decimal, count: number) {
  const scale = Math.max(sum.scale, 12);
  const dividend = atScale(sum, scale);
  const divisor = BigInt(count);
  const remainder = dividend % divisor;
  const magnitude = remainder < 0 ? -remainder : remainder;
  const rounding = magnitude * 2n >= divisor ? (dividend < 0 ? -1n : 1n) : 0n;
  return compactDecimal(decimalText({ units: dividend / divisor + rounding, scale }));
}

function matchesCriterion(cell: CellValue, number: Decimal | null, criterion: string, expected: Decimal | null, operator: string) {
  let comparison = cell.value.toLowerCase() === criterion.toLowerCase() ? 0 : 1;
  if (number && expected) comparison = compareDecimals(number, expected);
  if (operator === '=') return comparison === 0;
  if (operator === '<>') return comparison !== 0;
  if (!number || !expected) return false;
  if (operator === '<') return comparison < 0;
  if (operator === '>') return comparison > 0;
  return operator === '<=' ? comparison <= 0 : comparison >= 0;
}

export function tableData(table: TableBlock) {
  const rowCount = dataRowCount(table);
  const indices = new Map(table.columns.map((column, index) => [column.id, index]));
  const results = new Map<string, CellValue>();
  const calculating = new Set<string>();
  const strings = new Map<number, CellValue>();
  const concatenating = new Set<number>();

  function read(row: number, column: number): CellValue {
    const item = table.rows[row];
    const value = item.cells[column] ?? '';
    if (value.startsWith("'")) return { value: value.slice(1), forcedText: true };
    const formula = readFormula(item, table.columns[column].id);
    if (formula) return formula.name === 'CONCAT' ? concat(formula, row, column) : calculate(formula);
    if (!isFormulaEntry(value)) return { value };
    const { message } = parseFormula(value, table.columns, column);
    return { value, message: message ?? 'Re-enter the formula to link its columns.' };
  }

  function concat(formula: Extract<Formula, { name: 'CONCAT' }>, row: number, column: number): CellValue {
    const key = row * table.columns.length + column;
    const cached = strings.get(key);
    if (cached) return cached;
    if (concatenating.has(key)) return { value: '', message: 'This formula refers to itself.' };
    concatenating.add(key);
    let value = '';
    let message: string | undefined;
    for (const part of formula.parts) {
      if ('literal' in part) {
        value += part.literal;
        continue;
      }
      const index = indices.get(part.columnId);
      const cell = index === undefined ? { value: '', message: 'The referenced column was deleted.' } : read(row, index);
      if (cell.message) {
        message = cell.message;
        break;
      }
      value += textForDisplay(cell);
    }
    concatenating.delete(key);
    const result: CellValue = { value, message, calculated: 'text' };
    strings.set(key, result);
    return result;
  }

  function numeric(cell: CellValue, column: number) {
    const type = table.columns[column].type;
    if (cell.forcedText || (cell.calculated && cell.calculated !== 'number') || (type !== 'auto' && type !== 'decimal')) return null;
    if (type === 'auto' && !cell.calculated && /^0\d+$/.test(cell.value.trim())) return null;
    const value = cell.calculated ? cell.value : parseDecimal(cell.value, table.numberFormat);
    return value === null ? null : decimal(value);
  }

  function date(cell: CellValue, column: number) {
    const type = table.columns[column].type;
    return !cell.forcedText && (!cell.calculated || cell.calculated === 'date') && (type === 'auto' || type === 'date') ? parseDate(cell.value) : null;
  }

  function calculate(formula: Exclude<Formula, { name: 'CONCAT' }>): CellValue {
    const conditionId = 'condition' in formula ? formula.condition.columnId : undefined;
    const sourceId = formula.name === 'COUNTIF' ? undefined : formula.source?.columnId ?? conditionId;
    const criterion = 'criterion' in formula ? formula.criterion : '';
    const name = formula.name === 'AVG' ? 'AVERAGE' : formula.name;
    const distinct = formula.name === 'COUNT' && formula.distinct === true;
    const key = JSON.stringify([name, conditionId, criterion, sourceId, distinct]);
    const cached = results.get(key);
    if (cached) return cached;
    if (calculating.has(key)) return { value: '', message: 'This formula refers to itself.' };
    const condition = conditionId === undefined ? undefined : indices.get(conditionId);
    const source = sourceId === undefined ? undefined : indices.get(sourceId);
    if ((conditionId !== undefined && condition === undefined) || (sourceId !== undefined && source === undefined)) {
      return { value: '', message: 'The referenced column was deleted.' };
    }
    calculating.add(key);
    const result = source !== undefined && (name === 'MIN' || name === 'MAX' || name === 'MEDIAN') ? ordered(name, source)
      : source !== undefined && name === 'COUNT' ? countValues(source, distinct) : aggregate(name, source, condition, criterion);
    calculating.delete(key);
    results.set(key, result);
    return result;
  }

  function countValues(source: number, distinct: boolean): CellValue {
    const seen = new Set<string>();
    let count = 0;
    for (let row = 0; row < rowCount; row++) {
      const cell = read(row, source);
      if (cell.message) return cell;
      if (!cell.value.trim()) continue;
      if (!distinct) {
        count++;
        continue;
      }
      const number = numeric(cell, source);
      const day = date(cell, source);
      seen.add(number ? 'number:' + compactDecimal(decimalText(number)) : day ? 'date:' + day : 'text:' + cell.value.toLowerCase());
    }
    return { value: String(distinct ? seen.size : count), calculated: 'number' };
  }

  function ordered(name: OrderedFunction, source: number): CellValue {
    const numbers: Decimal[] = [];
    const dates: string[] = [];
    for (let row = 0; row < rowCount; row++) {
      const cell = read(row, source);
      if (cell.message) return cell;
      const number = numeric(cell, source);
      const day = date(cell, source);
      if (number) numbers.push(number);
      else if (day) dates.push(day);
    }
    if (numbers.length && dates.length) return { value: '', message: name + ' needs either numbers or dates in this column.' };
    if (dates.length) {
      dates.sort();
      const [first, second] = orderedPositions(name, dates.length);
      if (first === second) return { value: dates[first], calculated: 'date' };
      const dayLength = 86_400_000;
      const midpoint = (Date.parse(dates[first]) + Date.parse(dates[second])) / 2;
      return { value: new Date(Math.floor(midpoint / dayLength) * dayLength).toISOString().slice(0, 10), calculated: 'date' };
    }
    if (!numbers.length) return { value: '', message: name + ' needs at least one number or date.' };
    numbers.sort(compareDecimals);
    const [first, second] = orderedPositions(name, numbers.length);
    if (first === second) return { value: decimalText(numbers[first]), calculated: 'number' };
    const scale = Math.max(numbers[first].scale, numbers[second].scale);
    return { value: mean({ units: atScale(numbers[first], scale) + atScale(numbers[second], scale), scale }, 2), calculated: 'number' };
  }

  function orderedPositions(name: OrderedFunction, count: number) {
    if (name === 'MIN') return [0, 0];
    if (name === 'MAX') return [count - 1, count - 1];
    return [Math.floor((count - 1) / 2), Math.floor(count / 2)];
  }

  function aggregate(name: Formula['name'], source: number | undefined, condition: number | undefined, criterion: string): CellValue {
    let sum: Decimal = { units: 0n, scale: 0 };
    let count = 0;
    const operator = /^(<>|<=|>=|=|<|>)/.exec(criterion)?.[0];
    const expectedText = operator ? criterion.slice(operator.length) : criterion;
    const normalized = condition === undefined ? null : parseDecimal(expectedText, table.numberFormat);
    const expected = normalized === null ? null : decimal(normalized);
    for (let row = 0; row < rowCount; row++) {
      if (condition !== undefined) {
        const cell = read(row, condition);
        if (cell.message) return cell;
        if (!matchesCriterion(cell, expected ? numeric(cell, condition) : null, expectedText, expected, operator ?? '=')) continue;
      }
      if (source === undefined) {
        count++;
        continue;
      }
      const cell = read(row, source);
      if (cell.message) return cell;
      const number = numeric(cell, source);
      if (!number) continue;
      const scale = Math.max(sum.scale, number.scale);
      sum = { units: atScale(sum, scale) + atScale(number, scale), scale };
      count++;
    }
    if (name === 'AVERAGE' && !count) return { value: '', message: 'AVERAGE needs at least one number.' };
    const value = name === 'COUNTIF' ? String(count) : name === 'AVERAGE' ? mean(sum, count) : decimalText(sum);
    return { value, calculated: 'number' };
  }

  function textForDisplay(cell: CellValue) {
    if (cell.message) return '#ERROR';
    return cell.calculated === 'number' && table.numberFormat === 'decimal-comma' ? cell.value.replace('.', ',') : cell.value;
  }

  const columns = table.columns.map((column, index) => {
    if (column.type !== 'auto') return { ...column, type: column.type };
    const cells = Array.from({ length: rowCount }, (_, row) => read(row, index));
    const type = cells.some((cell) => (cell.forcedText || cell.calculated === 'text') && cell.value) ? 'text'
      : inferType(cells.map((cell) => cell.message ? '' : textForDisplay(cell)), table.numberFormat);
    return { ...column, type };
  });

  function cell(row: number, column: number) {
    const value = read(row, column);
    if (value.message) return { message: value.message };
    const type = columns[column].type;
    if ((value.forcedText || value.calculated === 'text') && value.value && type !== 'text') {
      return { message: 'This is text. Use Auto or Text for this column.' };
    }
    return validateCell(value.value, type, value.calculated === 'number' ? 'decimal-point' : table.numberFormat);
  }

  return { columns, cell, display: (row: number, column: number) => textForDisplay(read(row, column)) };
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
