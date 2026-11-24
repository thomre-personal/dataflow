import { columnLetter } from './workspace.ts';
import type { Column, Formula, FormulaColumn, Row } from './workspace.ts';

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
  CONCAT: 'CONCAT("Text", Column, …)',
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

function resolveColumn(columns: Column[], argument: string): FormulaColumn | undefined {
  const bracketed = argument.startsWith('[') && argument.endsWith(']');
  const name = (bracketed ? argument.slice(1, -1).replaceAll(']]', ']') : unquote(argument)).toLowerCase();
  const matches = columns.filter((column) => column.name.toLowerCase() === name);
  if (matches.length === 1) return { columnId: matches[0].id, reference: 'name' };
  if (matches.length > 1 || bracketed || argument.startsWith('"')) return;
  const byLetter = columns.findIndex((_, position) => columnLetter(position).toLowerCase() === name);
  if (byLetter >= 0) return { columnId: columns[byLetter].id, reference: 'letter' };
}

export function parseFormula(value: string, columns: Column[], index: number): { formula?: Formula; message?: string } {
  if (!isFormulaEntry(value)) return {};
  const name = /^=\s*([a-z]+)/i.exec(value.trim())?.[1].toUpperCase() as Formula['name'] | undefined;
  if (!name || !functionNames.includes(name)) return { message: 'Choose a supported function from the suggestions.' };
  const input = /^=\s*[a-z]+\s*\((.*)\)$/is.exec(value.trim())?.[1];
  const args = input === undefined ? undefined : splitArguments(input);
  const syntaxError = { message: 'Use =' + formulaFunctions[name] + '.' };
  const referenceError = { message: 'Choose a unique column name or letter for ' + name + '.' };
  if (!args) return syntaxError;
  if (name === 'CONCAT') {
    if (!args.length) return syntaxError;
    const parts: Extract<Formula, { name: 'CONCAT' }>['parts'] = [];
    for (const argument of args) {
      const part = argument.startsWith('"') && argument.endsWith('"') ? { literal: unquote(argument) } : resolveColumn(columns, argument);
      if (!part) return referenceError;
      parts.push(part);
    }
    return { formula: { name, parts } };
  }
  if (name !== 'SUMIF' && name !== 'COUNTIF') {
    if (args.length > 1) return syntaxError;
    const distinct = name === 'COUNT' ? /^DISTINCT\s*\((.*)\)$/is.exec(args[0] ?? '') : null;
    const source: FormulaColumn | undefined = args.length ? resolveColumn(columns, distinct ? distinct[1].trim() : args[0])
      : { columnId: columns[index].id, reference: 'implicit' };
    if (!source) return referenceError;
    return name === 'COUNT' ? { formula: { name, source, distinct: Boolean(distinct) } } : { formula: { name, source } };
  }
  if (args.length < 2 || args.length > (name === 'SUMIF' ? 3 : 2)) return syntaxError;
  const condition = resolveColumn(columns, args[0]);
  if (!condition) return referenceError;
  const criterion = unquote(args[1]);
  if (name === 'COUNTIF') return { formula: { name, condition, criterion } };
  const source = args.length === 3 ? resolveColumn(columns, args[2]) : undefined;
  return args.length === 3 && !source ? referenceError : { formula: { name, condition, criterion, source } };
}

export function bindCellFormula(formulas: NonNullable<Row['formulas']>, columns: Column[], index: number, value: string) {
  const { formula } = parseFormula(value, columns, index);
  if (formula) formulas[columns[index].id] = formula;
  else delete formulas[columns[index].id];
}

export function bindImportedFormulas(data: { columns: Column[]; rows: Row[] }) {
  return {
    ...data,
    rows: data.rows.map((row) => {
      const formulas: NonNullable<Row['formulas']> = {};
      row.cells.forEach((value, index) => {
        if (isFormulaEntry(value)) bindCellFormula(formulas, data.columns, index, value);
      });
      return Object.keys(formulas).length ? { ...row, formulas } : row;
    }),
  };
}

export function readFormula(row: Row, columnId: string): Formula | undefined {
  const stored = row.formulas?.[columnId];
  return stored && ('name' in stored ? stored : { name: 'SUM', source: stored });
}

export function cellFormulaText(row: Row, columns: Column[], index: number) {
  const raw = row.cells[index] ?? '';
  const formula = readFormula(row, columns[index].id);
  if (!formula) return raw;
  function reference(source: FormulaColumn, concat = false) {
    const index = columns.findIndex((column) => column.id === source.columnId);
    if (index < 0) return;
    if (source.reference === 'implicit') return '';
    if (source.reference === 'letter') return columnLetter(index);
    const name = columns[index].name;
    if (!/[,;"()[\]]/.test(name) && name.trim() === name) return name;
    return concat ? '[' + name.replaceAll(']', ']]') + ']' : quote(name);
  }
  if (formula.name === 'CONCAT') {
    const parts = formula.parts.map((part) => 'literal' in part ? quote(part.literal) : reference(part, true));
    return parts.includes(undefined) ? raw : '=CONCAT(' + parts.join(', ') + ')';
  }
  const refs = 'condition' in formula ? [reference(formula.condition), quote(formula.criterion)] : [reference(formula.source)];
  if (formula.name === 'SUMIF' && formula.source) refs.push(reference(formula.source));
  if (refs.includes(undefined)) return raw;
  const args = formula.name === 'COUNT' && formula.distinct ? 'DISTINCT(' + refs[0] + ')' : refs.join(', ');
  return '=' + formula.name + '(' + args + ')';
}
