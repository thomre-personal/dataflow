import assert from 'node:assert/strict';
import test from 'node:test';
import { importGrid, invalidTableCells, parseDate, parseDecimal, parseDelimited } from '../src/lib/clipboard.ts';
import { addLink, canConnect, createBlock, createWorkspace } from '../src/lib/workspace.ts';

test('preserves quoted tabs and newlines, blank cells, and CRLF in spreadsheet ranges', () => {
  assert.deepEqual(parseDelimited('Date\tLabel\tAmount\r\n03.01.2026\t"Two\tlines\r\ncontinued"\t\r\n\tGroceries\t12,50\r\n'), [
    ['Date', 'Label', 'Amount'],
    ['03.01.2026', 'Two\tlines\r\ncontinued', ''],
    ['', 'Groceries', '12,50'],
  ]);
});

test('infers typed data without changing saved values or losing leading zeros', () => {
  const source = 'Date\tAmount\tReference\tUnused\n03.01.2026\t€1.234,50\t0009\t\n2026-01-04\t(5,10)\t0081\t';
  const imported = importGrid(parseDelimited(source), true, 'decimal-comma');
  assert.deepEqual(imported.columns.map((column) => column.type), ['date', 'decimal', 'text', 'text']);
  assert.deepEqual(imported.rows[0].cells, ['03.01.2026', '€1.234,50', '0009', '']);
  assert.equal(parseDecimal('€1.234,50', 'auto'), '1234.50');
  assert.equal(parseDecimal('1,234.50', 'decimal-point'), '1234.50');
  assert.equal(parseDecimal('(5,10)', 'decimal-comma'), '-5.10');
  assert.equal(parseDate('29.02.2025'), null);
});

test('uses stable SQL aliases and prevents data-flow cycles', () => {
  const workspace = createWorkspace('Budget');
  const a = { ...createBlock('table', { x: 0, y: 0 }), title: 'August Expenses' };
  const b = createBlock('sql', { x: 50, y: 0 });
  const c = createBlock('sql', { x: 100, y: 0 });
  workspace.blocks = [a, b, c];
  const connected = addLink(addLink(workspace, a.id, b.id), b.id, c.id);
  assert.equal(connected.links[0].alias, 'august_expenses');
  assert.equal(canConnect(connected, c.id, b.id), false);
});

test('replacing a named column keeps its type and reports invalid pasted data', () => {
  const initial = importGrid([['Date', 'Amount'], ['2026-01-03', '21.40']], true, 'auto');
  const replacement = importGrid([['Amount', 'Date'], ['', '31.02.2026']], true, 'auto', initial.columns);
  assert.deepEqual(replacement.columns.map((column) => column.id), initial.columns.map((column) => column.id).reverse());
  const block = createBlock('table', { x: 0, y: 0 });
  assert.ok(block.kind === 'table');
  assert.deepEqual([...invalidTableCells({ ...block, ...replacement })], [
    { row: 0, column: 1, message: 'Enter a valid date (YYYY-MM-DD or DD.MM.YYYY).' },
  ]);
});
