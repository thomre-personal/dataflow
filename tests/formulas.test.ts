import assert from 'node:assert/strict';
import test from 'node:test';
import { bindTableFormulas, cellFormulaText, parseFormula, readFormula } from '../src/lib/formulas.ts';
import { tableResult } from '../src/lib/format.ts';
import { invalidTableCells, tableData } from '../src/lib/table-data.ts';
import { addLink, canConnect, createBlock, createWorkspace, tableInputs } from '../src/lib/workspace.ts';

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

test('evaluates Boolean functions, nested formulas, and current-row references', () => {
  const table = createBlock('table', { x: 0, y: 0 });
  const columns = [
    { id: 'paid', name: 'Paid', type: 'boolean' as const },
    { id: 'refunded', name: 'Refunded', type: 'auto' as const },
    { id: 'result', name: 'Result', type: 'auto' as const },
  ];
  const cases = [
    ['true', 'false', '=AND(Paid, NOT(Refunded))', 'true'],
    ['false', 'false', '=OR(Paid, Refunded)', 'false'],
    ['true', 'true', '=XOR(Paid, Refunded)', 'false'],
    ['true', 'true', '=XOR(Paid, Refunded, TRUE)', 'true'],
    ['true', 'false', '=XNOR(Paid, Refunded)', 'false'],
    ['false', 'false', '=XAND(Paid, Refunded)', 'true'],
    ['true', 'false', '=NAND(Paid, Refunded)', 'true'],
    ['false', 'false', '=NOR(Paid, Refunded)', 'true'],
  ];
  const block = bindTableFormulas({ ...table, columns, rows: cases.map(([paid, refunded, expression], index) =>
    ({ id: 'row-' + index, cells: [paid, refunded, expression] })) });
  const evaluated = tableData(block);
  assert.deepEqual(cases.map((_, row) => evaluated.display(row, 2)), cases.map(([, , , expected]) => expected));
  assert.equal(tableResult(block).columns[2].type, 'boolean');

  const renamed = [{ ...columns[0], name: 'TRUE' }, ...columns.slice(1)];
  const expression = '=AND([TRUE], NOT(Refunded))';
  assert.equal(cellFormulaText(block.rows[0], renamed, 2), expression);
  assert.deepEqual(parseFormula(expression, renamed, 2).formula, readFormula(block.rows[0], columns[2].id));

  const problems = bindTableFormulas({ ...block, rows: [
    { id: 'text', cells: ["'true", 'false', '=AND(Paid, Refunded)'] },
    { id: 'cycle', cells: ['true', 'false', '=OR(TRUE, NOT(Result))'] },
    { id: 'arity', cells: ['true', 'false', '=NOT(Paid, Refunded)'] },
    { id: 'concat', cells: ['true', 'false', '=CONCAT("Paid: ", AND(Paid, NOT(Refunded)))'] },
  ] });
  const data = tableData(problems);
  assert.match(data.cell(0, 2).message ?? '', /needs Boolean values/);
  assert.match(data.cell(1, 2).message ?? '', /refers to itself/);
  assert.match(data.cell(2, 2).message ?? '', /Use =NOT/);
  assert.equal(data.display(3, 2), 'Paid: true');
});

test('aggregates linked table columns using stable IDs and the source data and number format', () => {
  const transactions = createBlock('table', { x: 0, y: 0 });
  const summary = createBlock('table', { x: 0, y: 0 });
  assert.ok(transactions.kind === 'table' && summary.kind === 'table');
  transactions.title = 'Transactions';
  transactions.columns[0] = { ...transactions.columns[0], name: 'Amount', type: 'decimal' };
  transactions.columns[1] = { ...transactions.columns[1], name: 'Category', type: 'text' };
  transactions.numberFormat = 'decimal-comma';
  transactions.footerRows = 1;
  transactions.rows = [['2,00', 'Home'], ['10,00', 'Other'], ['4,00', 'Home'], ['999,00', 'Home']]
    .map((cells, index) => ({ id: String(index), cells }));
  summary.rows[0].cells = ['=MEDIAN(Transactions::Amount)', '=SUMIF(Transactions::Category, "Home", Transactions::Amount)'];
  const workspace = { ...createWorkspace('Budget'), blocks: [transactions, summary] };
  assert.match(tableData(summary, workspace).cell(0, 0).message ?? '', /Connect Transactions/);

  const connected = addLink(workspace, transactions.id, summary.id);
  assert.equal(canConnect(connected, summary.id, transactions.id), false);
  const bound = bindTableFormulas(summary, tableInputs(connected, summary.id));
  assert.deepEqual(tableResult(bound, connected).rows[0], ['4.00', '6.00']);
  assert.match(tableData(bound, workspace).cell(0, 0).message ?? '', /Reconnect/);

  transactions.title = 'Ledger, 2026';
  transactions.columns[0].name = 'Paid';
  transactions.rows[2].cells[0] = '8,00';
  const inputs = tableInputs(connected, summary.id);
  const displayed = cellFormulaText(bound.rows[0], bound.columns, 0, inputs);
  assert.equal(displayed, '=MEDIAN([Ledger, 2026]::Paid)');
  assert.equal(parseFormula(displayed, bound.columns, 0, inputs).formula?.name, 'MEDIAN');
  assert.deepEqual(tableResult(bound, connected).rows[0], ['8.00', '10.00']);
});
