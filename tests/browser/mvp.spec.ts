import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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
  await expect(page.getByRole('textbox', { name: 'Note row 1' })).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'Amount row 1' })).toHaveValue('1.234,50');
  await page.getByRole('textbox', { name: 'Amount row 2' }).fill('12,95');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Add SQL query', exact: true }).click();
  await page.getByRole('combobox', { name: 'Connect input' }).selectOption({ label: 'Pasted data' });
  await page.getByRole('textbox', { name: 'Query', exact: true }).fill(
    "SELECT strftime(date, '%Y-%m') AS month, sum(amount) AS total FROM pasted_data GROUP BY month ORDER BY month;",
  );
  await page.getByRole('button', { name: 'Run query' }).click();
  await expect(page.getByRole('cell', { name: '1247.45', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Add chart', exact: true }).click();
  await page.getByRole('combobox', { name: 'Connect input' }).selectOption({ label: 'Untitled SQL query' });
  await expect(page.getByRole('img', { name: 'total chart' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Find a block', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search by block name' }).fill('pasted');
  await page.getByRole('textbox', { name: 'Search by block name' }).press('Enter');
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
  const left = editor.getByRole('textbox', { name: 'Column 4 row 2', exact: true });
  await expect(left).toBeFocused();
  await left.press('Alt+ArrowRight');
  await expect(editor.getByRole('textbox', { name: 'Column 5 row 2', exact: true })).toBeFocused();
  await expect(editor.getByRole('textbox', { name: 'Date row 3', exact: true })).toHaveValue('31.02.2026');

  await editor.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Open query', exact: true }).click();
  await page.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Transactions, row 3, Date:');
  await page.getByRole('button', { name: 'Open table', exact: true }).click();
  await editor.getByRole('button', { name: 'Go to cell', exact: true }).click();
  const invalidDate = editor.getByRole('textbox', { name: 'Date row 3', exact: true });
  await expect(invalidDate).toBeFocused();
  await invalidDate.fill('2026-02-28');
  await expect(invalidDate).not.toHaveAttribute('aria-invalid', 'true');
  await expect(editor.getByRole('status')).toHaveCount(0);
});

test('scrolls to the last row in an expanded table on the canvas', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Long table');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Paste data', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Cell range' }).fill('Item\tAmount\n' + Array.from({ length: 72 }, (_, index) => 'Item ' + (index + 1) + '\t' + index).join('\n'));
  await page.getByRole('button', { name: 'Create table' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Expand table Pasted data', exact: true }).click();
  const full = page.getByRole('region', { name: 'Full table data' });
  await expect(full.getByRole('table')).toHaveAttribute('aria-rowcount', '73');
  await full.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(full.getByRole('cell', { name: 'Item 72', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse table Pasted data', exact: true }).click();
  await expect(full).toHaveCount(0);
});

async function dragOutput(page: Page, name: string, y: number) {
  const source = page.locator('.svelte-flow__node').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await source.hover();
  const exit = source.locator('.quick-exit');
  await expect(exit).toHaveCSS('opacity', '1');
  const handle = (await exit.boundingBox())!;
  const canvas = (await page.locator('.canvas-stage').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
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
  const sql = config.getByRole('textbox', { name: 'SQL', exact: true });
  await expect(sql).toHaveValue(/FROM "transactions"/);
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
