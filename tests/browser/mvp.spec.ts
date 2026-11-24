import { expect, test } from '@playwright/test';

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
