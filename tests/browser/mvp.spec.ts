import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

test('pastes a Numbers-style range, queries exact values, links a chart and restores the canvas after reload', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Canvas', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'total chart' })).toBeVisible();
  const initialZoom = await page.getByLabel('Canvas zoom').textContent();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(page.getByLabel('Canvas zoom')).not.toHaveText(initialZoom ?? '100%');

  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Budget test');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Paste data', exact: true }).first().click();
  const pastedRange = 'Date\tCategory\tAmount\tNote\r\n03.01.2026\tHobbies\t1.234,50\t\r\n10.01.2026\tHobbies\t12,90\t"Second item"\r\n05.02.2026\tHome\t89,00\t';
  const cellRange = page.getByRole('textbox', { name: 'Cell range' });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate((text) => navigator.clipboard.writeText(text), pastedRange);
  await cellRange.focus();
  await page.keyboard.press('ControlOrMeta+V');
  await expect(cellRange).toHaveValue(/1\.234,50/);
  await page.getByRole('combobox', { name: 'Number format' }).selectOption('decimal-comma');
  await page.getByRole('button', { name: 'Create table' }).click();
  const pastedTable = page.getByRole('dialog', { name: 'Pasted data' });
  await expect(pastedTable.getByRole('textbox', { name: 'Note row 1' })).toHaveValue('');
  await expect(pastedTable.getByRole('textbox', { name: 'Amount row 1' })).toHaveValue('1.234,50');
  await pastedTable.getByRole('textbox', { name: 'Amount row 2' }).fill('12,95');
  await pastedTable.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Add SQL query', exact: true }).click();
  const queryDialog = page.getByRole('dialog', { name: 'Edit SQL', exact: true });
  await queryDialog.getByRole('combobox', { name: 'Connect input' }).selectOption({ label: 'Pasted data' });
  await queryDialog.getByRole('textbox', { name: 'SQL code' }).fill(
    "SELECT strftime(date, '%Y-%m') AS month, sum(amount) AS total FROM pasted_data GROUP BY month ORDER BY month;",
  );
  await queryDialog.getByRole('button', { name: 'Save and run' }).click();
  await expect(page.getByRole('cell', { name: '1247.45', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Add chart', exact: true }).click();
  const chartDialog = page.getByRole('dialog', { name: 'Untitled chart' });
  await chartDialog.getByRole('combobox', { name: 'Source' }).selectOption({ label: 'Untitled SQL query' });
  await chartDialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('img', { name: 'total chart' }).first()).toBeVisible();
  const search = page.getByRole('combobox', { name: 'Find a block' });
  await page.keyboard.press('ControlOrMeta+k');
  await expect(search).toBeFocused();
  await search.fill('pasted');
  await expect(page.getByRole('listbox', { name: 'Search results' }).getByRole('option', { name: /Pasted data/ })).toBeVisible();
  await search.press('Escape');
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Block inspector' }).getByRole('heading', { name: 'Pasted data' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exit focus view' })).toBeVisible();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Workspaces' })).toContainText('Budget test');
  await expect(page.getByRole('img', { name: 'total chart' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(page.getByRole('cell', { name: '1247.45', exact: true })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('validates typed cells and inserts rows and columns relative to the active cell', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open table', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Transactions' });
  const date = editor.getByRole('textbox', { name: 'Date row 1', exact: true });
  await date.fill('31.02.2026');
  await expect(date).toHaveAttribute('aria-invalid', 'true');
  await expect(editor.getByRole('status')).toContainText('1 invalid cell');
  await date.press('Alt+ArrowUp');
  await expect(date).toBeFocused();
  await expect(date).toHaveValue('');
  await date.press('Alt+ArrowDown');
  const secondDate = editor.getByRole('textbox', { name: 'Date row 2', exact: true });
  await expect(secondDate).toBeFocused();
  await secondDate.press('Alt+ArrowLeft');
  const left = editor.getByRole('textbox', { name: 'A row 2', exact: true });
  await expect(left).toBeFocused();
  await left.press('Alt+ArrowRight');
  await expect(editor.getByRole('textbox', { name: 'B row 2', exact: true })).toBeFocused();
  await expect(editor.getByRole('textbox', { name: 'Date row 3', exact: true })).toHaveValue('31.02.2026');

  await editor.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Open query', exact: true }).click();
  await page.getByRole('dialog', { name: 'Edit SQL', exact: true }).getByRole('button', { name: 'Save and run' }).click();
  await expect(page.getByRole('alert')).toContainText('Transactions, row 3, Date:');
  await page.getByRole('button', { name: 'Open table', exact: true }).click();
  await editor.getByRole('button', { name: 'Go to cell', exact: true }).click();
  const invalidDate = editor.getByRole('textbox', { name: 'Date row 3', exact: true });
  await expect(invalidDate).toBeFocused();
  await invalidDate.fill('2026-02-28');
  await expect(invalidDate).not.toHaveAttribute('aria-invalid', 'true');
  await expect(editor.getByRole('status')).toHaveCount(0);
});

function canvasBlock(page: Page, title: string) {
  return page.locator('.svelte-flow__node').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

function cardSize(node: Locator) {
  return node.locator('.graph-card').evaluate((element: HTMLElement) => ({ width: element.offsetWidth, height: element.offsetHeight }));
}

async function dragResize(page: Page, handle: Locator, dx: number, dy: number) {
  const bounds = (await handle.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

async function dragBlock(page: Page, header: Locator, x: number, y: number) {
  const bounds = (await header.boundingBox())!;
  await page.mouse.move(bounds.x + 16, bounds.y + 18);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 16 });
  await page.mouse.up();
}

test('resizes an expanded table, scrolls to its last row and restores the size', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Long table');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Paste data', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Cell range' }).fill('Item\tAmount\n' + Array.from({ length: 72 }, (_, index) => 'Item ' + (index + 1) + '\t' + index).join('\n'));
  await page.getByRole('button', { name: 'Create table' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const table = canvasBlock(page, 'Pasted data');
  await expect(table.getByRole('textbox', { name: 'Item row 1', exact: true })).toBeVisible();
  await table.getByRole('button', { name: 'Lock inline editing', exact: true }).click();
  await expect(table.getByRole('textbox', { name: 'Item row 1', exact: true })).toHaveCount(0);
  const initial = await cardSize(table);
  await dragResize(page, table.locator('.block-resize-edge.left'), -45, 0);
  await expect.poll(async () => (await cardSize(table)).width).toBeGreaterThan(initial.width);
  await dragResize(page, table.locator('.block-resize-corner.top.right'), 30, -75);
  await expect.poll(async () => (await cardSize(table)).height).toBeGreaterThan(initial.height);
  const resized = await cardSize(table);
  const full = page.getByRole('region', { name: 'Full table data' });
  await expect(full.getByRole('table')).toHaveAttribute('aria-rowcount', '73');
  await full.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(full.getByRole('cell', { name: 'Item 72', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse table Pasted data', exact: true }).click();
  await expect(full).toHaveCount(0);
  await expect(table.locator('.block-resize-corner')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand table Pasted data', exact: true }).click();
  await expect.poll(() => cardSize(table)).toEqual(resized);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => cardSize(table)).toEqual(resized);
  await table.getByRole('button', { name: 'Unlock inline editing', exact: true }).click();
  await expect(table.getByRole('textbox', { name: 'Item row 1', exact: true })).toBeVisible();
});

async function dragOutput(page: Page, name: string, y: number) {
  const source = canvasBlock(page, name);
  await source.hover();
  const exit = source.locator('.quick-exit');
  await expect(exit).toHaveCSS('opacity', '1');
  const handle = (await exit.boundingBox())!;
  const canvas = (await page.locator('.canvas-stage').boundingBox())!;
  const center = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
  await page.mouse.move(center.x - 30, center.y);
  await page.mouse.move(handle.x + handle.width + 5, center.y, { steps: 30 });
  await expect(exit).toHaveCSS('opacity', '1');
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .55, canvas.y + canvas.height * y, { steps: 12 });
  await page.mouse.up();
  return page.getByRole('group', { name: 'Add connected block' });
}

test('configures and connects a SQL query and chart through hovered output handles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'total chart' })).toBeVisible();
  const picker = await dragOutput(page, 'Transactions', .20);
  await picker.getByRole('button', { name: /SQL query/ }).click();
  const config = page.getByRole('dialog', { name: 'Configure SQL query' });
  await expect(config).toContainText('Input: Transactions');
  await config.getByRole('textbox', { name: 'Name' }).fill('Total spending');
  const sql = config.getByRole('textbox', { name: 'SQL code', exact: true });
  await expect(sql).toContainText('FROM "transactions"');
  await sql.fill('SELECT sum(amount) AS total FROM transactions;');
  await config.getByRole('button', { name: 'Create SQL query' }).click();
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  await expect(inspector.getByRole('heading', { name: 'Total spending', exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Transactions', exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(inspector.getByRole('cell', { name: '3314.15', exact: true })).toBeVisible();
  await (await dragOutput(page, 'Total spending', .86)).getByRole('button', { name: /^Chart/ }).click();
  const chartConfig = page.getByRole('dialog', { name: 'Configure chart' });
  await expect(chartConfig).toContainText('Input: Total spending');
  await chartConfig.getByRole('textbox', { name: 'Name' }).fill('Budget chart');
  await chartConfig.getByRole('combobox', { name: 'Chart type' }).selectOption('line');
  await chartConfig.getByRole('button', { name: 'Create chart' }).click();
  await expect(inspector.getByRole('heading', { name: 'Budget chart', exact: true })).toBeVisible();
  await expect(inspector.getByRole('img', { name: 'total chart' })).toBeVisible();
});

test('opens the SQL editor from the data tab, discards a draft, and resizes a chart that starts expanded', async ({ page }) => {
  await page.goto('/');
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  await inspector.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(inspector.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: 'Open query', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit SQL', exact: true });
  const code = dialog.getByRole('textbox', { name: 'SQL code', exact: true });
  await expect(code).toBeFocused();
  await expect(code.locator('.tok-keyword').first()).toBeVisible();
  await expect.poll(async () => (await dialog.locator('.cm-editor').boundingBox())?.height ?? 0).toBeGreaterThan(350);
  await code.fill('SELECT 999;');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(inspector.getByRole('table')).toBeVisible();
  await inspector.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Open query', exact: true }).click();
  await expect(code).toContainText('FROM transactions');
  await code.press('Escape');
  await expect(dialog).toHaveCount(0);

  const chart = canvasBlock(page, 'Spending by month');
  await expect(chart.getByRole('button', { name: 'Collapse chart Spending by month' })).toBeVisible();
  const expanded = await cardSize(chart);
  const plot = chart.getByRole('img', { name: 'total chart' });
  const plotWidth = await plot.evaluate((element) => element.clientWidth);
  await dragResize(page, chart.locator('.block-resize-corner.top.left'), 60, 30);
  await expect.poll(async () => (await cardSize(chart)).width).toBeLessThan(expanded.width);
  await expect.poll(() => plot.evaluate((element) => element.clientWidth)).toBeLessThan(plotWidth);
  const resized = await cardSize(chart);
  await chart.getByRole('button', { name: 'Collapse chart Spending by month' }).click();
  await expect.poll(async () => (await cardSize(chart)).width).toBeLessThan(resized.width);
  await chart.getByRole('button', { name: 'Expand chart Spending by month' }).click();
  await expect.poll(() => cardSize(chart)).toEqual(resized);
});

test('renames inline, deletes from the canvas or inspector, and restores changes with undo and redo', async ({ page }) => {
  await page.goto('/');
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  const redo = page.getByRole('button', { name: 'Redo', exact: true });
  await expect(undo).toBeDisabled();
  await canvasBlock(page, 'Transactions').getByRole('button', { name: 'Rename Transactions', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Block name' });
  await expect(field).toBeFocused();
  await field.fill('Canceled name');
  await field.press('Escape');
  await expect(undo).toBeDisabled();
  await canvasBlock(page, 'Transactions').getByRole('button', { name: 'Rename Transactions', exact: true }).click();
  await field.fill('  Household spending  ');
  await field.press('Enter');
  const table = canvasBlock(page, 'Household spending');
  await expect(table).toBeVisible();
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  await expect(inspector.getByText('transactions', { exact: true })).toBeVisible();

  await page.getByRole('complementary', { name: 'Workspace blocks' }).getByRole('button', { name: 'Household spending', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.keyboard.press('Delete');
  await expect(table).toHaveCount(0);
  await undo.click();
  await expect(table).toBeVisible();
  await redo.click();
  await expect(table).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(table).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await inspector.getByRole('button', { name: 'Delete block' }).click();
  await expect(table).toHaveCount(0);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
});

test('places blocks from the toolbar, edits a table inline, and edits SQL and charts in dialogs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Inline budget');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  const dropArea = page.getByRole('region', { name: 'Canvas drop area' });
  await page.getByRole('button', { name: 'Add table', exact: true }).dragTo(dropArea, { targetPosition: { x: 35, y: 60 } });
  const table = canvasBlock(page, 'Untitled table');
  const inlineTable = table.getByRole('group', { name: 'Edit Untitled table' });
  await inlineTable.getByRole('textbox', { name: 'A row 1', exact: true }).fill('2');
  await expect(inlineTable.getByRole('combobox', { name: 'A type' })).toHaveValue('auto');
  await inlineTable.getByRole('button', { name: 'Row', exact: true }).click();
  await inlineTable.getByRole('textbox', { name: 'A row 2', exact: true }).fill('99');
  await inlineTable.getByRole('spinbutton', { name: 'Title columns' }).fill('1');
  await inlineTable.getByRole('spinbutton', { name: 'Title columns' }).press('Tab');
  await inlineTable.getByRole('spinbutton', { name: 'Footer rows' }).fill('1');
  await inlineTable.getByRole('spinbutton', { name: 'Footer rows' }).press('Tab');
  await inlineTable.getByRole('textbox', { name: 'A row 1', exact: true }).evaluate((cell) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '2\n3');
    cell.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  });
  await expect(inlineTable.getByRole('textbox', { name: 'A row 3', exact: true })).toHaveValue('99');
  await table.getByRole('button', { name: 'Lock inline editing', exact: true }).click();
  await expect(table.locator('.footer-row').getByRole('rowheader', { name: '99' })).toBeVisible();

  await page.getByRole('button', { name: 'Add SQL query', exact: true }).dragTo(dropArea, { targetPosition: { x: 510, y: 60 } });
  const query = page.getByRole('dialog', { name: 'Edit SQL', exact: true });
  await query.getByRole('combobox', { name: 'Connect input' }).selectOption({ label: 'Untitled table' });
  await expect(query.getByText('untitled_table', { exact: true })).toBeVisible();
  await query.getByRole('textbox', { name: 'SQL code' }).fill('SELECT sum("A") AS total FROM untitled_table;');
  await query.getByRole('button', { name: 'Save and run' }).click();
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  await inspector.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(inspector.getByRole('cell', { name: '5', exact: true })).toBeVisible();
  await expect(inspector.getByRole('cell', { name: '104', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add chart', exact: true }).dragTo(dropArea, { targetPosition: { x: 40, y: 395 } });
  const chart = canvasBlock(page, 'Untitled chart');
  const chartDialog = page.getByRole('dialog', { name: 'Untitled chart' });
  await chartDialog.getByRole('combobox', { name: 'Source' }).selectOption({ label: 'Untitled table' });
  await chartDialog.getByRole('combobox', { name: 'Chart type' }).selectOption('line');
  await chartDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(chart.getByRole('img', { name: 'A chart' })).toBeVisible();
  await expect(chart.getByText('Line chart', { exact: true })).toBeVisible();
});

test('resizes and collapses groups and moves canvas blocks in and out of nested groups', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Grouped budget');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  const area = page.getByRole('region', { name: 'Canvas drop area' });
  const addGroup = page.getByRole('button', { name: 'Add group', exact: true });
  await addGroup.dragTo(area, { targetPosition: { x: 450, y: 85 } });
  await canvasBlock(page, 'Untitled group').getByRole('button', { name: 'Rename Untitled group' }).click();
  const name = page.getByRole('textbox', { name: 'Block name' });
  await name.fill('Budget group');
  await name.press('Enter');
  const outer = canvasBlock(page, 'Budget group');
  const outerCard = outer.locator('.group-card');
  const outerSize = () => outerCard.evaluate((element: HTMLElement) => ({ width: element.offsetWidth, height: element.offsetHeight }));
  const original = await outerSize();
  await dragResize(page, outer.locator('.block-resize-corner.bottom.right'), 50, 55);
  await expect.poll(async () => (await outerSize()).width).toBeGreaterThan(original.width);
  await expect.poll(async () => (await outerSize()).height).toBeGreaterThan(original.height);
  const resized = await outerSize();
  await outer.getByRole('button', { name: 'Collapse group Budget group' }).click();
  await expect(outer.locator('.block-resize-edge')).toHaveCount(0);
  await outer.getByRole('button', { name: 'Expand group Budget group' }).click();
  await expect.poll(outerSize).toEqual(resized);

  const stage = (await area.boundingBox())!;
  const groupBox = (await outer.boundingBox())!;
  await addGroup.dragTo(area, { targetPosition: { x: groupBox.x - stage.x + 65, y: groupBox.y - stage.y + 85 } });
  const inner = canvasBlock(page, 'Untitled group');
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  const parent = inspector.getByRole('combobox', { name: 'Group', exact: true });
  await expect(parent).toHaveValue((await outer.getAttribute('data-id'))!);
  await page.getByRole('button', { name: 'Add table', exact: true }).dragTo(area, { targetPosition: { x: 35, y: 90 } });
  const table = canvasBlock(page, 'Untitled table');
  await expect(parent).toHaveValue('');
  const innerBox = (await inner.boundingBox())!;
  await dragBlock(page, table.locator('.node-heading'), innerBox.x + 70, innerBox.y + 78);
  await expect(parent).toHaveValue((await inner.getAttribute('data-id'))!);

  await outer.getByRole('button', { name: 'Collapse group Budget group' }).click();
  await expect(inner).toHaveCount(0);
  await expect(table).toHaveCount(0);
  await outer.getByRole('button', { name: 'Expand group Budget group' }).click();
  await expect(table).toBeVisible();

  const outerBox = (await outer.boundingBox())!;
  await dragBlock(page, table.locator('.node-heading'), outerBox.x + 28, outerBox.y + 60);
  await expect(parent).toHaveValue((await outer.getAttribute('data-id'))!);
  const canvasBox = (await area.boundingBox())!;
  await dragBlock(page, table.locator('.node-heading'), canvasBox.x + 70, canvasBox.y + 100);
  await expect(parent).toHaveValue('');
  await outer.getByRole('button', { name: 'Collapse group Budget group' }).click();
  await expect(inner).toHaveCount(0);
  await expect(table).toBeVisible();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(outer.getByRole('button', { name: 'Expand group Budget group' })).toBeVisible();
  await expect(table).toBeVisible();
});

test('saves appearance and shortcut preferences and can delete without a hotkey confirmation', async ({ page }) => {
  await page.goto('/');
  const settingsButton = page.getByRole('button', { name: 'Settings', exact: true });
  await settingsButton.click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings.getByRole('combobox', { name: 'Appearance' })).toHaveValue('auto');
  await settings.getByRole('combobox', { name: 'Appearance' }).selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settings.getByRole('checkbox', { name: 'Confirm block deletion by shortcut' }).uncheck();
  const shortcut = settings.getByRole('button', { name: 'Change shortcut for Delete selected block' });
  await shortcut.click();
  await shortcut.press('Shift+Delete');
  await expect(shortcut).toContainText('Delete');
  await settings.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('complementary', { name: 'Workspace blocks' }).getByRole('button', { name: 'Spending by month' }).click();
  const chart = canvasBlock(page, 'Spending by month');
  await page.keyboard.press('Delete');
  await expect(chart).toBeVisible();
  await page.keyboard.press('Shift+Delete');
  await expect(chart).toHaveCount(0);
  await settingsButton.click();
  await expect(settings.getByRole('checkbox', { name: 'Confirm block deletion by shortcut' })).not.toBeChecked();
  await settings.getByRole('button', { name: 'Reset shortcuts' }).click();
  await expect(shortcut).toHaveText('Delete');
});

test('calculates table sums, keeps formula references after rename, and handles deletion and zero-based rows', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Formula budget');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const table = page.getByRole('dialog', { name: 'Untitled table' });
  await expect(table.getByRole('combobox', { name: 'A type' })).toHaveValue('auto');
  await table.getByRole('combobox', { name: 'First row' }).selectOption('0');
  const name = table.getByRole('textbox', { name: 'Column 1 name' });
  await name.fill('Amount');
  await name.press('Tab');
  await table.getByRole('button', { name: 'Column', exact: true }).click();
  await table.getByRole('button', { name: 'Row', exact: true }).click();
  await table.getByRole('button', { name: 'Row', exact: true }).click();
  const footerCount = table.getByRole('spinbutton', { name: 'Footer rows' });
  await footerCount.fill('1');
  await footerCount.press('Tab');
  await table.getByRole('textbox', { name: 'Amount row 0', exact: true }).fill('0.1');
  await table.getByRole('textbox', { name: 'Amount row 1', exact: true }).fill('0.2');
  const footer = table.getByRole('textbox', { name: 'Amount row 2', exact: true });
  await footer.fill('=SUM()');
  const namedSum = table.getByRole('textbox', { name: 'B row 0', exact: true });
  await namedSum.fill('=SUM(Amount)');
  await namedSum.press('Tab');
  await expect(namedSum).toHaveValue('0.3');
  await expect(footer).toHaveValue('0.3');
  await name.fill('Revenue');
  await name.press('Tab');
  await expect(namedSum).toHaveValue('0.3');
  await namedSum.focus();
  await expect(namedSum).toHaveValue('=SUM(Revenue)');
  await table.getByRole('button', { name: 'Delete column Revenue', exact: true }).click();
  await expect(namedSum).toHaveAttribute('aria-invalid', 'true');
  await expect(namedSum).toHaveValue('#ERROR');
  await expect(table.getByRole('button', { name: 'Delete column B', exact: true })).toBeDisabled();
  await table.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const canvasTable = canvasBlock(page, 'Untitled table');
  await expect(canvasTable.getByRole('textbox', { name: 'B row 0', exact: true })).toHaveValue('0.3');
});

test('suggests formulas in both table editors and uses Return to accept suggestions and cells', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Suggested formulas');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  await dialog.getByRole('button', { name: 'Column', exact: true }).click();
  const first = dialog.getByRole('textbox', { name: 'A row 1', exact: true });
  await first.fill("'=");
  await expect(page.getByRole('listbox', { name: 'Formula suggestions' })).toHaveCount(0);
  await first.press('Enter');
  await expect(first).toHaveValue('=');
  await expect(first).not.toBeFocused();

  const second = dialog.getByRole('textbox', { name: 'B row 1', exact: true });
  await second.fill('=');
  const suggestions = page.getByRole('listbox', { name: 'Formula suggestions' });
  await expect(suggestions.getByRole('option', { name: /^MEDIAN/ })).toBeVisible();
  await second.fill('=CON');
  await expect(suggestions.getByRole('option')).toHaveCount(1);
  await second.press('Enter');
  await expect(second).toHaveValue('=CONCAT()');
  await expect(second).toBeFocused();
  await second.fill('=CONCAT("Prefix#", A, "Suffix")');
  await second.press('Enter');
  await expect(second).toHaveValue('Prefix#=Suffix');
  await dialog.getByRole('button', { name: 'Done' }).click();

  const inline = canvasBlock(page, 'Untitled table').getByRole('textbox', { name: 'B row 1', exact: true });
  await inline.fill('=S');
  await expect(suggestions.getByRole('option')).toHaveCount(2);
  await inline.press('ArrowDown');
  await expect(suggestions.getByRole('option', { name: /^SUMIF/ })).toHaveAttribute('aria-selected', 'true');
  await suggestions.getByRole('option', { name: /^SUMIF/ }).click();
  await expect(inline).toHaveValue('=SUMIF()');
  await expect(inline).toBeFocused();
  await inline.fill('=COUNT(DISTINCT(A))');
  await inline.press('Enter');
  await expect(inline).toHaveValue('1');
});
