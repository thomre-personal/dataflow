import type { Column, NumberFormat, Row, ValueType } from './workspace.ts';
import { columnLetter, newId } from './workspace.ts';
import { isFormulaEntry } from './formulas.ts';
import { isCellStyle } from './cell-style.ts';
import type { CellStyle } from './cell-style.ts';

export const MAX_ROWS = 10_000;
export const MAX_COLUMNS = 80;

export const cellClipboardType = 'application/x-dataflow-cells';
export type CopiedCell = { text: string; style?: CellStyle; sourceRow?: number };

export function copyGrid(clipboard: DataTransfer, cells: CopiedCell[][]) {
  clipboard.setData(cellClipboardType, JSON.stringify(cells));
  const quote = (text: string) => /[\t\r\n,;"]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  const text = cells.length === 1 && cells[0].length === 1
    ? cells[0][0].text : cells.map((row) => row.map(({ text }) => quote(text)).join('\t')).join('\n');
  clipboard.setData('text/plain', text);
}

export function readCopiedGrid(clipboard: DataTransfer) {
  const text = clipboard.getData(cellClipboardType);
  if (!text) return;
  try {
    const cells: unknown = JSON.parse(text);
    if (!Array.isArray(cells) || !cells.length || cells.length > MAX_ROWS || !Array.isArray(cells[0])) return;
    const width = cells[0].length;
    if (!width || width > MAX_COLUMNS || !cells.every((row) => Array.isArray(row) && row.length === width
      && row.every((cell) => cell && typeof cell.text === 'string' && (cell.style === undefined || isCellStyle(cell.style))
        && (cell.sourceRow === undefined || (Number.isSafeInteger(cell.sourceRow) && cell.sourceRow >= 0))))) return;
    return cells as CopiedCell[][];
  } catch {
    return;
  }
}

const webCellClipboardType = 'web ' + cellClipboardType;

export async function writeCellClipboard(clipboard: DataTransfer) {
  const text = clipboard.getData('text/plain');
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'text/plain': new Blob([text], { type: 'text/plain' }),
      [webCellClipboardType]: new Blob([clipboard.getData(cellClipboardType)], { type: cellClipboardType }),
    })]);
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

export async function readCellClipboard() {
  const clipboard = new DataTransfer();
  try {
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/plain')) clipboard.setData('text/plain', await (await item.getType('text/plain')).text());
      if (item.types.includes(webCellClipboardType)) {
        clipboard.setData(cellClipboardType, await (await item.getType(webCellClipboardType)).text());
      }
      if (clipboard.types.length) return clipboard;
    }
  } catch {
    clipboard.setData('text/plain', await navigator.clipboard.readText());
  }
  return clipboard;
}

function delimiterFor(text: string): string {
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"' && (quoted || i === 0 || /[\t,;\r\n]/.test(text[i - 1]))) quoted = !quoted;
    if (quoted) continue;
    if (character === '\t') return '\t';
    if (character === ',') commas++;
    if (character === ';') semicolons++;
  }
  if (semicolons > 0) return ';';
  // A single column of decimal-comma values is commonly copied as plain text.
  if (commas && !text.trim().split(/\r?\n/).every((line) => /^[-+]?\d+,\d+$/.test(line.trim()))) return ',';
  return '\t';
}

export function parseDelimited(text: string): string[][] {
  const content = text.replace(/^\uFEFF/, '');
  if (!content) return [];
  const delimiter = delimiterFor(content);
  const output: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  function finishRow() {
    output.push([...row, field]);
    if (output.length > MAX_ROWS + 1) throw new Error('Paste up to ' + MAX_ROWS.toLocaleString() + ' data rows at a time.');
    row = [];
    field = '';
  }

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.length === 0) {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      finishRow();
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('A pasted cell has an opening quote without a closing quote.');
  if (row.length || field.length || !/[\r\n]$/.test(content)) finishRow();
  const width = Math.max(...output.map((item) => item.length));
  if (width > MAX_COLUMNS) throw new Error('Paste up to ' + MAX_COLUMNS + ' columns at a time.');
  return output.map((item) => Array.from({ length: width }, (_, i) => item[i] ?? ''));
}

export function parseDecimal(value: string, format: NumberFormat = 'auto'): string | null {
  let text = value.trim().replace(/[\s\u00a0\u202f'’]/g, '').replace(/[€$£¥]/g, '').replace(/−/g, '-');
  if (/^\(.*\)$/.test(text)) text = '-' + text.slice(1, -1);
  if (!/^[+-]?(?:\d[\d.,]*|[.,]\d+)$/.test(text)) return null;
  const dot = text.lastIndexOf('.');
  const comma = text.lastIndexOf(',');
  const separator = format === 'decimal-comma' ? ',' : format === 'decimal-point' ? '.'
    : comma > dot ? ',' : '.';
  const grouping = separator === '.' ? ',' : '.';
  const parts = text.split(separator);
  if (parts.length > 2) {
    return format === 'auto' && new RegExp('^[+-]?\\d{1,3}(?:[.,]\\d{3})+$').test(text)
      ? text.replace(/[.,]/g, '') : null;
  }
  const [integer, fraction] = parts;
  if (integer.includes(grouping)) {
    const normalized = integer.split(grouping);
    if (!/^[+-]?\d{1,3}$/.test(normalized[0]) || normalized.slice(1).some((part) => !/^\d{3}$/.test(part))) return null;
  }
  if (fraction !== undefined && !/^\d+$/.test(fraction)) return null;
  const normalized = integer.replaceAll(grouping, '');
  const sign = normalized.startsWith('-') ? '-' : '';
  const digits = normalized.replace(/^[+-]/, '').replace(/^0+(?=\d)/, '') || '0';
  return sign + digits + (fraction === undefined ? '' : '.' + fraction);
}

export function parseDate(value: string): string | null {
  let text = value.trim();
  const european = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (european) text = european[3] + '-' + european[2].padStart(2, '0') + '-' + european[1].padStart(2, '0');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(text + 'T00:00:00Z');
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

export function parseBoolean(value: string): string | null {
  if (/^(true|yes|wahr|ja)$/i.test(value.trim())) return 'true';
  if (/^(false|no|falsch|nein)$/i.test(value.trim())) return 'false';
  return null;
}

export function normalizedCell(value: string, type: ValueType, numberFormat: NumberFormat): string | null {
  if (!value.trim()) return null;
  switch (type) {
    case 'text': return value;
    case 'date': return parseDate(value);
    case 'decimal': return parseDecimal(value, numberFormat);
    case 'boolean': return parseBoolean(value);
  }
}

export function validateCell(value: string, type: ValueType, numberFormat: NumberFormat):
  { value: string | null; message?: undefined } | { message: string; value?: undefined } {
  const normalized = normalizedCell(value, type, numberFormat);
  if (normalized !== null || !value.trim()) return { value: normalized };
  if (type === 'date') return { message: 'Enter a valid date (YYYY-MM-DD or DD.MM.YYYY).' };
  if (type === 'boolean') return { message: 'Enter true or false.' };
  const example = numberFormat === 'decimal-comma' ? '1.234,56' : numberFormat === 'decimal-point' ? '1,234.56' : '1234.56 or 1234,56';
  return { message: 'Enter a number such as ' + example + '.' };
}

export function inferType(values: string[], numberFormat: NumberFormat): ValueType {
  const nonempty = values.filter((value) => value.trim());
  if (!nonempty.length) return 'text';
  if (nonempty.every((value) => parseDate(value))) return 'date';
  if (nonempty.every((value) => !/^0\d+$/.test(value.trim()) && parseDecimal(value, numberFormat))) return 'decimal';
  if (nonempty.every((value) => parseBoolean(value))) return 'boolean';
  return 'text';
}

export function importGrid(grid: string[][], header: boolean, numberFormat: NumberFormat, existing: Column[] = []): { columns: Column[]; rows: Row[] } {
  if (!grid.length || !grid.some((row) => row.some((cell) => cell.trim()))) throw new Error('Paste a cell range to continue.');
  const width = Math.max(...grid.map((item) => item.length));
  const body = header ? grid.slice(1) : grid;
  if (body.length > MAX_ROWS) throw new Error('Paste up to ' + MAX_ROWS.toLocaleString() + ' data rows at a time.');
  const used = new Set<string>();
  const columns = Array.from({ length: width }, (_, index): Column => {
    const title = (header ? grid[0][index]?.trim() : existing[index]?.name) || columnLetter(index);
    let name = title;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = title + ' ' + i;
    used.add(name.toLowerCase());
    const previous = header ? existing.find((column) => column.name.trim().toLowerCase() === name.toLowerCase()) : existing[index];
    const values = body.map((row) => row[index] ?? '');
    const needsEvaluation = values.some((value) => value.startsWith("'") || isFormulaEntry(value));
    return { id: previous?.id ?? newId(), name, type: previous?.type ?? (needsEvaluation ? 'auto' : inferType(values, numberFormat)) };
  });
  return { columns, rows: body.map((cells) => ({ id: newId(), cells })) };
}
