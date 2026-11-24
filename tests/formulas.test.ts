import assert from 'node:assert/strict';
import test from 'node:test';
import { bindTableFormulas, cellFormulaText } from '../src/lib/formulas.ts';
import { tableResult } from '../src/lib/format.ts';
import { invalidTableCells, tableData } from '../src/lib/table-data.ts';
import { createBlock } from '../src/lib/workspace.ts';

test('evaluates aggregates for text, numbers, and dates with footer rows excluded', () => {
  const table = createBlock('table', { x: 0, y: 0 });
  assert.ok(table.kind === 'table');
  const columns = ['Category', 'Amount', 'Date', 'Label'].map((name) => ({ id: name, name, type: 'auto' as const }));
  const grid = [
    ['Groceries', '0.10', '2026-01-01', '=CONCAT("Prefix, ", Category, " ""today""")'],
    ['groceries', '0.20', '05.01.2026', '=CONCAT(Category, "#", Date)'],
    ['Hobby', "'100", '2026-01-07', "'=SUM(Amount)"],
    ['', '0.3', '2026-01-02', "'="],
    ['=COUNT(DISTINCT(Category))', '=AVERAGE(Amount)', '=MIN(Date)', '=COUNTIF(Category, "GROCERIES")'],
    ['=COUNT(Category)', '=AVG(Amount)', '=MAX(Date)', '=SUMIF(Category, "Groceries", Amount)'],
    ['=COUNTIF(Amount, ">0.10")', '=MEDIAN(Amount)', '=MEDIAN(Date)', '=MIN(Amount)'],
    ['', '=MAX(Amount)', '', '=SUMIF(Amount, "<0.30")'],
  ];
  const imported = bindTableFormulas({ columns, rows: grid.map((cells, row) => ({ id: String(row), cells })) });
  const block = { ...table, ...imported, footerRows: 4 };
  const data = tableData(block);
  assert.deepEqual(grid.map((_, row) => columns.map((_, column) => data.display(row, column))).slice(4), [
    ['2', '0.2', '2026-01-01', '2'],
    ['3', '0.2', '2026-01-07', '0.30'],
    ['2', '0.20', '2026-01-03', '0.10'],
    ['', '0.3', '', '0.30'],
  ]);
  assert.deepEqual(tableResult(block).rows.map((row) => row[3]), ['Prefix, Groceries "today"', 'groceries#05.01.2026', '=SUM(Amount)', '=']);

  const renamed = { ...block, columns: columns.map((column) => ({ ...column, name: column.name === 'Category' ? 'Expense, type' : column.name })) };
  assert.equal(tableData(renamed).display(5, 3), '0.30');
  assert.equal(cellFormulaText(renamed.rows[0], renamed.columns, 3), '=CONCAT("Prefix, ", [Expense, type], " ""today""")');
  assert.equal(cellFormulaText(renamed.rows[4], renamed.columns, 0), '=COUNT(DISTINCT("Expense, type"))');
});

test('reads saved SUM bindings and keeps a text escape out of numeric columns', () => {
  const table = createBlock('table', { x: 0, y: 0 });
  assert.ok(table.kind === 'table');
  const column = table.columns[0];
  const rows = [
    { id: 'first', cells: ['2'] }, { id: 'text', cells: ["'123"] },
    { id: 'footer', cells: ['=SUM(A)'], formulas: { [column.id]: { columnId: column.id, reference: 'name' as const } } },
  ];
  const data = tableData({ ...table, columns: [{ ...column, name: 'Renamed', type: 'decimal' }], rows, footerRows: 1 });
  assert.equal(data.display(2, 0), '2');
  assert.equal(data.display(1, 0), '123');
  assert.match(data.cell(1, 0).message ?? '', /This is text/);
  assert.equal(cellFormulaText(rows[2], [{ ...column, name: 'Renamed' }], 0), '=SUM(Renamed)');
});

test('binds nested CONCAT expressions and keeps their column references after a rename', () => {
  const table = createBlock('table', { x: 0, y: 0 });
  assert.ok(table.kind === 'table');
  const columns = ['Category', 'Label'].map((name) => ({ id: name, name, type: 'auto' as const }));
  const expression = '=CONCAT("DISTINCT:", COUNT(DISTINCT(Category)))';
  const saved = {
    ...table, columns, footerRows: 1,
    rows: [
      { id: 'one', cells: ['Home', expression] },
      { id: 'two', cells: ['home', '=CONCAT("[", CONCAT(Category, ":", COUNT(DISTINCT(Category))), "]")'] },
      { id: 'three', cells: ['Work', '=CONCAT("Loop:", COUNT(Label))'] },
      { id: 'four', cells: ['', ''] },
      { id: 'footer', cells: ['Summary', expression] },
    ],
  };
  const bound = bindTableFormulas(saved);
  const data = tableData(bound);
  assert.equal(data.display(0, 1), 'DISTINCT:2');
  assert.equal(data.display(1, 1), '[home:2]');
  assert.match(data.cell(2, 1).message ?? '', /refers to itself/);
  assert.equal(data.display(4, 1), 'DISTINCT:2');
  const renamed = [{ ...columns[0], name: 'Expense category' }, columns[1]];
  assert.equal(cellFormulaText(bound.rows[0], renamed, 1), '=CONCAT("DISTINCT:", COUNT(DISTINCT(Expense category)))');
  assert.equal(tableData(bindTableFormulas({ ...bound, columns: renamed })).display(0, 1), 'DISTINCT:2');
});

test('allows text summaries in typed footers and still reports broken formulas', () => {
  const table = createBlock('table', { x: 0, y: 0 });
  assert.ok(table.kind === 'table');
  const columns = [{ ...table.columns[0], name: 'Amount', type: 'decimal' as const }];
  const rows = [
    { id: 'value', cells: ['2.50'] },
    { id: 'wrong-type', cells: ['=CONCAT("Amount: ", "text")'] },
    { id: 'text', cells: ['Total'] },
    { id: 'broken', cells: ['=SUM(Missing)'] },
  ];
  const block = bindTableFormulas({ ...table, columns, rows, footerRows: 2 });
  assert.deepEqual([...invalidTableCells(block)].map(({ row }) => row), [1, 3]);

  const summary = bindTableFormulas({ ...table, columns, footerRows: 1, rows: [
    rows[0], { id: 'summary', cells: ['=CONCAT("Summe: ", SUM())'] },
  ] });
  const data = tableData(summary);
  assert.equal(data.display(1, 0), 'Summe: 2.50');
  assert.deepEqual(data.cell(1, 0), { value: 'Summe: 2.50' });
  assert.deepEqual(tableResult(summary).rows, [['2.50']]);
});
