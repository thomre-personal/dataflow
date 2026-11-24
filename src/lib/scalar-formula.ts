import { columnLetter } from './workspace.ts';
import type { Column, FormulaInput, ScalarExpression } from './workspace.ts';

const bareName = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const nameText = (name: string) => bareName.test(name) ? name : '[' + name.replaceAll(']', ']]') + ']';
const nameKey = (name: string) => (name.startsWith('[') ? name.slice(1, -1).replaceAll(']]', ']') : name).toLowerCase();
const operators = { '+': 1, '-': 1, '*': 2, '/': 2 } as const;
type Operator = keyof typeof operators;
const isOperator = (value: string): value is Operator => Object.hasOwn(operators, value);

export function parseScalar(text: string, columns: Column[], inputs: FormulaInput[]): { expression?: ScalarExpression; message?: string } {
  const token = /\s*(?:(?<source>\[(?:[^\]]|\]\])*\]|[\p{L}_][\p{L}\p{N}_]*)\s*\.\s*(?<field>\[(?:[^\]]|\]\])*\]|[\p{L}_][\p{L}\p{N}_]*)|(?<cell>[a-z]+\d+)\b|(?<number>\d+(?:\.\d+)?|\.\d+)|(?<symbol>[()+*/-]))/giyu;
  const parts: (ScalarExpression | string)[] = [];
  while (token.lastIndex < text.length) {
    const match = token.exec(text);
    if (!match || parts.length >= 96) return {};
    const { source, field, cell, number, symbol } = match.groups!;
    if (source) {
      const key = nameKey(source);
      const configs = inputs.filter((input) => 'config' in input);
      const aliases = configs.filter((input) => input.alias.toLowerCase() === key);
      const matches = aliases.length ? aliases : configs.filter((input) => input.config.title.toLowerCase() === key);
      if (matches.length !== 1) return { message: 'Connect a unique config named ' + source + ' or make it global.' };
      const config = matches[0].config;
      const entry = config.fields.find((item) => item.name.toLowerCase() === nameKey(field));
      if (!entry) return { message: 'The config ' + source + ' has no field named ' + field + '.' };
      parts.push({ kind: 'config', blockId: config.id, fieldId: entry.id });
    } else if (cell) {
      const [, letter, digits] = /^([a-z]+)(\d+)$/i.exec(cell)!;
      const column = columns.find((_, index) => columnLetter(index) === letter.toUpperCase());
      const row = Number(digits);
      if (!column || !Number.isSafeInteger(row)) return { message: 'Choose an existing cell address.' };
      parts.push({ kind: 'cell', columnId: column.id, row });
    } else if (number) {
      parts.push({ kind: 'number', value: number.startsWith('.') ? '0' + number : number });
    } else {
      parts.push(symbol);
    }
  }

  let cursor = 0;
  function parse(minimum: number): ScalarExpression | undefined {
    const next = parts[cursor++];
    let left: ScalarExpression | undefined;
    if (next === '(') {
      left = parse(1);
      if (parts[cursor++] !== ')') return;
    } else if (next === '+' || next === '-') {
      const operand = parse(3);
      if (!operand) return;
      left = next === '-' ? { kind: 'binary', operator: '-', left: { kind: 'number', value: '0' }, right: operand } : operand;
    } else if (typeof next === 'object') {
      left = next;
    }
    if (!left) return;
    while (typeof parts[cursor] === 'string') {
      const operator = parts[cursor] as string;
      if (!isOperator(operator) || operators[operator] < minimum) break;
      cursor++;
      const right = parse(operators[operator] + 1);
      if (!right) return;
      left = { kind: 'binary', operator, left, right };
    }
    return left;
  }
  const expression = parse(1);
  return cursor === parts.length ? { expression } : {};
}

export function scalarText(expression: ScalarExpression, columns: Column[], inputs: FormulaInput[], minimum = 0): string | undefined {
  switch (expression.kind) {
    case 'number': return expression.value;
    case 'cell': {
      const index = columns.findIndex(({ id }) => id === expression.columnId);
      return index < 0 ? undefined : columnLetter(index) + expression.row;
    }
    case 'config': {
      const configs = inputs.filter((input) => 'config' in input);
      const input = configs.find(({ config }) => config.id === expression.blockId);
      const field = input?.config.fields.find(({ id }) => id === expression.fieldId);
      if (!input || !field) return;
      const title = input.config.title;
      const key = title.toLowerCase();
      const unique = configs.every((other) => other === input || (other.config.title.toLowerCase() !== key && other.alias !== key));
      return (unique ? nameText(title) : input.alias) + '.' + nameText(field.name);
    }
    case 'binary': {
      const rank = operators[expression.operator];
      const left = scalarText(expression.left, columns, inputs, rank);
      const right = scalarText(expression.right, columns, inputs, rank + 1);
      if (left === undefined || right === undefined) return;
      const text = left + expression.operator + right;
      return rank < minimum ? '(' + text + ')' : text;
    }
  }
}
