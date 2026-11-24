import { columnLetter } from './workspace.ts';
import type { Column, Formula, FormulaColumn, Row, TableInput } from './workspace.ts';

export const formulaFunctions = {
  SUM: 'SUM([Column])',
  AVERAGE: 'AVERAGE([Column])',
  AVG: 'AVG([Column])',
  SUMIF: 'SUMIF(Column, Criterion, [Sum column])',
  COUNTIF: 'COUNTIF(Column, Criterion)',
  COUNT: 'COUNT(Column or DISTINCT(Column))',
  MIN: 'MIN([Column])',
  MAX: 'MAX([Column])',
  MEDIAN: 'MEDIAN([Column])',
  CONCAT: 'CONCAT("Text", Column, Expression, …)',
} satisfies Record<Formula['name'], string>;

const functionNames = Object.keys(formulaFunctions) as Formula['name'][];

export function isFormulaEntry(value: string) {
  return value.trimStart().startsWith('=');
}

export function suggestFunctions(value: string) {
  const prefix = /^\s*=\s*([a-z]*)$/i.exec(value)?.[1].toUpperCase();
  return prefix === undefined ? [] : functionNames.filter((name) => name.startsWith(prefix));
}

function splitArguments(text: string) {
  if (!text.trim()) return [];
  const args: string[] = [];
  let quoted = false;
  let bracketed = false;
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (!quoted && char === '[') bracketed = true;
    if (bracketed) {
      if (char === ']' && text[index + 1] === ']') index++;
      else if (char === ']') bracketed = false;
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (quoted) continue;
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth < 0) return;
    if (!depth && (char === ',' || char === ';')) {
      args.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quoted || bracketed || depth) return;
  args.push(text.slice(start).trim());
  return args.every(Boolean) ? args : undefined;
}

const unquote = (text: string) => text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1).replaceAll('""', '"') : text;
const quote = (text: string) => '"' + text.replaceAll('"', '""') + '"';
const bracket = (name: string) => '[' + name.replaceAll(']', ']]') + ']';
const isBracketed = (name: string) => name.startsWith('[') && name.endsWith(']');
const identifier = (name: string) => isBracketed(name) ? name.slice(1, -1).replaceAll(']]', ']') : unquote(name);
const needsQuotes = (name: string) => /[,;:"()[\]]/.test(name) || name.trim() !== name;

function resolveColumn(columns: Column[], argument: string): FormulaColumn | undefined {
  const name = identifier(argument).toLowerCase();
  const matches = columns.filter((column) => column.name.toLowerCase() === name);
  if (matches.length === 1) return { columnId: matches[0].id, reference: 'name' };
  if (matches.length > 1 || isBracketed(argument) || argument.startsWith('"')) return;
  const byLetter = columns.findIndex((_, position) => columnLetter(position).toLowerCase() === name);
  if (byLetter >= 0) return { columnId: columns[byLetter].id, reference: 'letter' };
}

function matchingInputs(inputs: TableInput[], name: string) {
  const key = name.toLowerCase();
  const aliases = inputs.filter((input) => input.alias.toLowerCase() === key);
  return aliases.length ? aliases : inputs.filter((input) => input.table.title.toLowerCase() === key);
}

function resolveReference(columns: Column[], argument: string, inputs: TableInput[]): { column?: FormulaColumn; message?: string } {
  const qualified = /^(\[(?:[^\]]|\]\])*\]|"(?:[^"]|"")*"|[^:[\]"]+?)\s*::\s*(.*)$/s.exec(argument);
  if (!qualified) return { column: resolveColumn(columns, argument) };
  const name = identifier(qualified[1].trim());
  const [input, duplicate] = matchingInputs(inputs, name);
  if (duplicate) return { message: 'Use an input alias to identify ' + name + '.' };
  if (!input) return { message: 'Connect ' + name + ' as an input to this table.' };
  const column = resolveColumn(input.table.columns, qualified[2].trim());
  return column ? { column: { ...column, tableId: input.table.id } }
    : { message: 'Choose a unique column name or letter from ' + input.table.title + '.' };
}

export function parseFormula(value: string, columns: Column[], index: number, inputs: TableInput[] = []): { formula?: Formula; message?: string } {
  if (!isFormulaEntry(value)) return {};
  return parseExpression(value.trimStart().slice(1).trim(), columns, index, inputs, 0);
}

function parseExpression(value: string, columns: Column[], index: number, inputs: TableInput[], depth: number): ReturnType<typeof parseFormula> {
  if (depth >= 64) return { message: 'Use fewer nested functions.' };
  const name = /^([a-z]+)/i.exec(value)?.[1].toUpperCase() as Formula['name'] | undefined;
  if (!name || !functionNames.includes(name)) return { message: 'Choose a supported function from the suggestions.' };
  const input = /^[a-z]+\s*\((.*)\)$/is.exec(value)?.[1];
  const args = input === undefined ? undefined : splitArguments(input);
  const syntaxError = { message: 'Use =' + formulaFunctions[name] + '.' };
  const referenceError = { message: 'Choose a unique column name or letter for ' + name + '.' };
  if (!args) return syntaxError;
  if (name === 'CONCAT') {
    if (!args.length) return syntaxError;
    const parts: Extract<Formula, { name: 'CONCAT' }>['parts'] = [];
    for (const argument of args) {
      if (argument.startsWith('"') && argument.endsWith('"')) {
        parts.push({ literal: unquote(argument) });
        continue;
      }
      const column = resolveColumn(columns, argument);
      if (column) {
        parts.push(column);
        continue;
      }
      if (!/^[a-z]+\s*\(/i.test(argument)) return referenceError;
      const nested = parseExpression(argument, columns, index, inputs, depth + 1);
      if (!nested.formula) return nested;
      parts.push({ expression: nested.formula });
    }
    return { formula: { name, parts } };
  }
  if (name !== 'SUMIF' && name !== 'COUNTIF') {
    if (args.length > 1) return syntaxError;
    const distinct = name === 'COUNT' ? /^DISTINCT\s*\((.*)\)$/is.exec(args[0] ?? '') : null;
    const { column: source, message } = args.length ? resolveReference(columns, distinct ? distinct[1].trim() : args[0], inputs)
      : { column: { columnId: columns[index].id, reference: 'implicit' as const }, message: undefined };
    if (!source) return message ? { message } : referenceError;
    return name === 'COUNT' ? { formula: { name, source, distinct: Boolean(distinct) } } : { formula: { name, source } };
  }
  if (args.length < 2 || args.length > (name === 'SUMIF' ? 3 : 2)) return syntaxError;
  const { column: condition, message } = resolveReference(columns, args[0], inputs);
  if (!condition) return message ? { message } : referenceError;
  const criterion = unquote(args[1]);
  if (name === 'COUNTIF') return { formula: { name, condition, criterion } };
  const sum = args.length === 3 ? resolveReference(columns, args[2], inputs) : {};
  if (args.length === 3 && !sum.column) return sum.message ? { message: sum.message } : referenceError;
  if (sum.column && sum.column.tableId !== condition.tableId) return { message: 'The SUMIF columns must belong to the same table.' };
  return { formula: { name, condition, criterion, source: sum.column } };
}

export function bindCellFormula(formulas: NonNullable<Row['formulas']>, columns: Column[], index: number, value: string, inputs: TableInput[] = []) {
  const { formula } = parseFormula(value, columns, index, inputs);
  if (formula) formulas[columns[index].id] = formula;
  else delete formulas[columns[index].id];
}

export function bindTableFormulas<T extends { columns: Column[]; rows: Row[] }>(data: T, inputs: TableInput[] = []): T {
  let changed = false;
  const rows = data.rows.map((row) => {
    let formulas: Row['formulas'];
    for (const [index, column] of data.columns.entries()) {
      const value = row.cells[index];
      if (!value || row.formulas?.[column.id] || !isFormulaEntry(value)) continue;
      const { formula } = parseFormula(value, data.columns, index, inputs);
      if (!formula) continue;
      formulas ??= { ...row.formulas };
      formulas[column.id] = formula;
    }
    if (!formulas) return row;
    changed = true;
    return { ...row, formulas };
  });
  return changed ? { ...data, rows } : data;
}

export function readFormula(row: Row, columnId: string): Formula | undefined {
  const stored = row.formulas?.[columnId];
  return stored && ('name' in stored ? stored : { name: 'SUM', source: stored });
}

export function cellFormulaText(row: Row, columns: Column[], index: number, inputs: TableInput[] = []) {
  const raw = row.cells[index] ?? '';
  const formula = readFormula(row, columns[index].id);
  const expression = formula && expressionText(formula, columns, inputs);
  return expression ? '=' + expression : raw;
}

function expressionText(formula: Formula, columns: Column[], inputs: TableInput[]): string | undefined {
  function reference(source: FormulaColumn, concat = false) {
    const input = source.tableId ? inputs.find(({ table }) => table.id === source.tableId) : undefined;
    if (source.tableId && !input) return;
    const sourceColumns = input?.table.columns ?? columns;
    const index = sourceColumns.findIndex((column) => column.id === source.columnId);
    if (index < 0) return;
    if (source.reference === 'implicit') return '';
    const name = sourceColumns[index].name;
    const column = source.reference === 'letter' ? columnLetter(index)
      : needsQuotes(name) ? (concat ? bracket(name) : quote(name)) : name;
    if (!input) return column;
    const [byTitle, duplicate] = matchingInputs(inputs, input.table.title);
    const table = byTitle === input && !duplicate ? input.table.title : input.alias;
    return (needsQuotes(table) ? bracket(table) : table) + '::' + column;
  }
  if (formula.name === 'CONCAT') {
    const parts = formula.parts.map((part) => {
      if ('literal' in part) return quote(part.literal);
      if ('expression' in part) return expressionText(part.expression, columns, inputs);
      return reference(part, true);
    });
    return parts.includes(undefined) ? undefined : 'CONCAT(' + parts.join(', ') + ')';
  }
  const refs = 'condition' in formula ? [reference(formula.condition), quote(formula.criterion)] : [reference(formula.source)];
  if (formula.name === 'SUMIF' && formula.source) refs.push(reference(formula.source));
  if (refs.includes(undefined)) return;
  const args = formula.name === 'COUNT' && formula.distinct ? 'DISTINCT(' + refs[0] + ')' : refs.join(', ');
  return formula.name + '(' + args + ')';
}
