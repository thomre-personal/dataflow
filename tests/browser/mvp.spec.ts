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
  await cellRange.press('Enter');
  const pastedTable = page.getByRole('dialog', { name: 'Pasted data' });
  await expect(pastedTable.getByRole('combobox', { name: 'Style', exact: true })).toHaveValue('grid');
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

async function createConfigPreset(page: Page, card: Locator, name: string) {
  await card.getByRole('combobox', { name: 'Preset', exact: true }).selectOption({ label: 'New preset…' });
  const dialog = page.getByRole('dialog', { name: 'New preset', exact: true });
  const input = dialog.getByRole('textbox', { name: 'Preset name', exact: true });
  await input.fill(name);
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
}

function columnHeader(table: Locator, name: string) {
  return table.getByRole('button', { name: 'Select column ' + name, exact: true });
}

function cardSize(node: Locator) {
  return node.locator('.graph-card').evaluate((element: HTMLElement) => ({ width: element.offsetWidth, height: element.offsetHeight }));
}

async function dragResize(page: Page, handle: Locator, dx: number, dy: number, verticalAnchor = .5) {
  const bounds = (await handle.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height * verticalAnchor;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

async function waitForCanvasFit(page: Page) {
  await page.locator('.svelte-flow__viewport').evaluate((viewport) => new Promise<void>((resolve) => {
    let previous = '';
    let stableFrames = 0;
    function frame() {
      const transform = getComputedStyle(viewport).transform;
      stableFrames = previous === transform ? stableFrames + 1 : 0;
      previous = transform;
      if (stableFrames >= 4) resolve();
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
}

async function dragBlock(page: Page, header: Locator, x: number, y: number) {
  const bounds = (await header.boundingBox())!;
  await page.mouse.move(bounds.x + 16, bounds.y + 18);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 16 });
  await page.mouse.up();
}

async function clickConnection(page: Page, connection: Locator) {
  const point = await connection.locator('.svelte-flow__edge-interaction').evaluate((element: SVGPathElement) => {
    const transform = element.getScreenCTM()!;
    const length = element.getTotalLength();
    for (const fraction of [.5, .4, .6, .3, .7, .2, .8]) {
      const { x, y } = element.getPointAtLength(length * fraction).matrixTransform(transform);
      if (document.elementFromPoint(x, y)?.closest('.svelte-flow__edge') === element.parentElement) return { x, y };
    }
    throw new Error('No visible point on the connection line.');
  });
  await page.mouse.click(point.x, point.y);
}

test('pans the canvas when a table cannot scroll and keeps native scrolling when it can', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Table scrolling');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table', exact: true });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await waitForCanvasFit(page);
  const card = canvasBlock(page, 'Untitled table');
  const viewport = () => page.locator('.svelte-flow__viewport').evaluate((element) => {
    const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { x: transform.m41, y: transform.m42, zoom: transform.m11 };
  });

  await card.getByRole('button', { name: 'Lock inline editing', exact: true }).click();
  const full = card.getByRole('region', { name: 'Full table data', exact: true });
  await expect.poll(() => full.evaluate((element) => element.scrollHeight - element.clientHeight)).toBe(0);
  await full.hover();
  const start = await viewport();
  await page.mouse.wheel(0, 70);
  await expect.poll(async () => (await viewport()).y).toBeCloseTo(start.y - 70);
  expect(await viewport()).toMatchObject({ x: start.x, zoom: start.zoom });
  await full.hover();
  await page.mouse.wheel(0, -70);
  await expect.poll(async () => (await viewport()).y).toBeCloseTo(start.y);

  await card.getByRole('button', { name: 'Unlock inline editing', exact: true }).click();
  await card.getByRole('button', { name: 'Open table', exact: true }).click();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const values = Array.from({ length: 30 }, (_, index) => index + '\tValue').join('\n');
  await page.evaluate((text) => navigator.clipboard.writeText(text), values);
  await dialog.getByRole('textbox', { name: 'A row 1', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+v');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  const editor = card.getByRole('group', { name: 'Edit Untitled table', exact: true });
  await editor.hover();
  const beforeScroll = await viewport();
  await page.mouse.wheel(0, 100);
  await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await viewport()).toEqual(beforeScroll);

  await editor.evaluate((element) => element.scrollTop = element.scrollHeight);
  await editor.hover();
  await page.mouse.wheel(0, 70);
  await expect.poll(async () => (await viewport()).y).toBeCloseTo(beforeScroll.y - 70);
  expect(await viewport()).toMatchObject({ zoom: beforeScroll.zoom });

  await page.getByRole('region', { name: 'Canvas drop area', exact: true }).hover({ position: { x: 24, y: 32 } });
  await page.mouse.wheel(0, -70);
  await expect.poll(async () => (await viewport()).zoom).toBeGreaterThan(beforeScroll.zoom);
});

test('keeps the table geometry when locking and grows the table from the outside handles', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Stable table layout');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  await page.getByRole('dialog', { name: 'Untitled table', exact: true }).getByRole('button', { name: 'Done', exact: true }).click();
  await waitForCanvasFit(page);
  const card = canvasBlock(page, 'Untitled table');
  const table = card.getByRole('table');
  const layout = () => card.locator('.node-inline').evaluate((editor) => ({
    width: editor.clientWidth, height: editor.clientHeight, scrollWidth: editor.scrollWidth, scrollHeight: editor.scrollHeight,
    columnsOverflow: editor.querySelector('.editor-grid')!.scrollWidth - editor.querySelector('.editor-grid')!.clientWidth,
    headers: [...editor.querySelectorAll<HTMLElement>('thead th')].map((header) => [header.offsetWidth, header.offsetHeight]),
    rows: [...editor.querySelectorAll<HTMLElement>('tbody tr')].map((row) => row.offsetHeight),
  }));
  const unfit = await cardSize(card);
  await card.getByRole('button', { name: 'Lock inline editing', exact: true }).click();
  for (const edge of ['right', 'bottom']) {
    const bounds = (await card.locator('.block-resize-edge.' + edge).boundingBox())!;
    await page.mouse.dblclick(bounds.x + bounds.width / 2, bounds.y + bounds.height * (edge === 'right' ? .18 : .5));
  }
  const lockedLayout = await layout();
  expect((await cardSize(card)).height).toBeLessThan(unfit.height);
  expect(lockedLayout.scrollHeight).toBe(lockedLayout.height);
  expect(lockedLayout.columnsOverflow).toBe(0);
  await expect(card.getByRole('button', { name: 'Select row 1', exact: true })).toBeDisabled();
  await expect(card.getByRole('button', { name: 'Delete row 1', exact: true })).toBeDisabled();
  await card.getByRole('button', { name: 'Unlock inline editing', exact: true }).click();
  expect(await layout()).toEqual(lockedLayout);
  await expect(card.getByRole('button', { name: 'Paste range', exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Delete row 1', exact: true })).toBeEnabled();

  const rowHandle = card.getByRole('button', { name: 'Add row', exact: true });
  const columnHandle = card.getByRole('button', { name: 'Add column', exact: true });
  const original = await cardSize(card);
  await rowHandle.click();
  await expect(table.locator('tbody tr')).toHaveCount(3);
  expect((await cardSize(card)).height).toBeGreaterThan(original.height);
  await columnHandle.click();
  await expect(table.getByRole('columnheader', { name: 'C', exact: true })).toBeVisible();
  expect((await cardSize(card)).width).toBeGreaterThan(original.width);
  await page.keyboard.press('Meta+z');
  await expect(table.getByRole('columnheader', { name: 'C', exact: true })).toHaveCount(0);
  await page.keyboard.press('Meta+Shift+z');
  await expect(table.getByRole('columnheader', { name: 'C', exact: true })).toBeVisible();

  await dragResize(page, rowHandle, 0, 86);
  await expect.poll(() => table.locator('tbody tr').count()).toBeGreaterThan(4);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(3);
  const beforeColumns = await cardSize(card);
  await page.getByRole('combobox', { name: 'Find a block', exact: true }).focus();
  await dragResize(page, columnHandle, 170, 0);
  await expect(columnHandle).toBeFocused();
  await expect(table.getByRole('columnheader', { name: 'E', exact: true })).toBeVisible();
  await page.keyboard.press('Meta+z');
  await expect(table.getByRole('columnheader', { name: 'D', exact: true })).toHaveCount(0);
  await expect.poll(() => cardSize(card)).toEqual(beforeColumns);
});

test('drags table handles inward one step at a time and keeps values, formulas and the footer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Shrink table');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table', exact: true });
  for (let index = 0; index < 3; index++) await dialog.getByRole('button', { name: 'Row', exact: true }).click();
  for (let index = 0; index < 2; index++) await dialog.getByRole('button', { name: 'Column', exact: true }).click();
  const formula = dialog.getByRole('textbox', { name: 'B row 2', exact: true });
  await formula.fill('=CONCAT("")');
  await formula.press('Enter');
  await expect(formula).toHaveValue('');
  await dialog.getByRole('textbox', { name: 'B row 5', exact: true }).fill('Keep the footer');
  const footerRows = dialog.getByRole('spinbutton', { name: 'Footer rows', exact: true });
  await footerRows.fill('1');
  await footerRows.press('Tab');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Fit canvas', exact: true }).click();
  await waitForCanvasFit(page);
  const card = canvasBlock(page, 'Untitled table');
  const rows = card.getByRole('table').locator('tbody tr, tfoot tr');
  const rowHandle = card.getByRole('button', { name: 'Add row', exact: true });
  const columnHandle = card.getByRole('button', { name: 'Add column', exact: true });
  const before = await cardSize(card);
  await rowHandle.hover();
  const bounds = (await rowHandle.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 12);
  await expect(rows).toHaveCount(4);
  await page.mouse.move(x, y - 110);
  await expect(rows).toHaveCount(3);
  await page.mouse.move(x, y - 12);
  await expect(rows).toHaveCount(4);
  await page.mouse.move(x, y - 110);
  await page.mouse.up();
  await expect(rows).toHaveCount(3);
  expect((await cardSize(card)).height).toBeLessThan(before.height);
  await expect(card.locator('.footer-row').getByRole('textbox', { name: 'B row 3', exact: true })).toHaveValue('Keep the footer');
  await dragResize(page, rowHandle, 0, -80);
  await expect(rows).toHaveCount(3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(rows).toHaveCount(5);

  await dragResize(page, columnHandle, -300, 0);
  await expect(card.getByRole('columnheader', { name: 'B', exact: true })).toBeVisible();
  await expect(card.getByRole('columnheader', { name: 'C', exact: true })).toHaveCount(0);
  expect((await cardSize(card)).width).toBeLessThan(before.width);
  await expect(card.getByRole('textbox', { name: 'B row 2', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(card.getByRole('columnheader', { name: 'D', exact: true })).toBeVisible();
});

test('fits short tables with footers and config blocks to their content height', async ({ page }) => {
  await page.goto('/');
  const connection = page.getByRole('group', { name: 'Connection from Transactions to Monthly totals', exact: true })
    .locator('.svelte-flow__edge-path');
  await expect(connection).toBeVisible();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const tableDialog = page.getByRole('dialog', { name: 'Untitled table', exact: true });
  const footerRows = tableDialog.getByRole('spinbutton', { name: 'Footer rows' });
  await footerRows.fill('1');
  await footerRows.press('Tab');
  await tableDialog.getByRole('button', { name: 'Done', exact: true }).click();

  const gapBelow = (title: string, selector: string) => canvasBlock(page, title).locator('.graph-card').evaluate((card: HTMLElement, contentSelector) => {
    const content = card.querySelector(contentSelector)!.getBoundingClientRect();
    const footer = card.querySelector('.node-footer')!.getBoundingClientRect();
    const preview = card.querySelector<HTMLElement>('.node-inline')!;
    const scale = card.getBoundingClientRect().height / card.offsetHeight;
    return (footer.top - content.bottom) / scale - (preview.offsetHeight - preview.clientHeight);
  }, selector);
  await expect.poll(() => gapBelow('Untitled table', 'tfoot')).toBeLessThanOrEqual(2);
  await expect.poll(() => canvasBlock(page, 'Untitled table').locator('.node-inline').evaluate((preview) =>
    preview.scrollHeight - preview.clientHeight)).toBeLessThanOrEqual(1);
  const tableHeights = () => canvasBlock(page, 'Untitled table').locator('.graph-card').evaluate(async (element: HTMLElement) => {
    const samples = new Set<number>();
    for (let frame = 0; frame < 20; frame++) {
      await new Promise(requestAnimationFrame);
      samples.add(element.offsetHeight);
    }
    return [...samples];
  });
  expect(await tableHeights()).toHaveLength(1);
  await canvasBlock(page, 'Untitled table').getByRole('button', { name: 'Lock inline editing', exact: true }).click();
  await expect.poll(() => gapBelow('Untitled table', 'tfoot')).toBeLessThanOrEqual(2);

  await page.getByRole('button', { name: 'Add config', exact: true }).click();
  const configDialog = page.getByRole('dialog', { name: 'Create config', exact: true });
  await configDialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Short config');
  await configDialog.getByRole('button', { name: 'Add field', exact: true }).click();
  await configDialog.getByRole('button', { name: 'Create config', exact: true }).click();
  await expect.poll(async () => Math.abs(await gapBelow('Short config', '.config-editor') - 8)).toBeLessThanOrEqual(1);
  await waitForCanvasFit(page);
  const config = canvasBlock(page, 'Short config');
  const before = await cardSize(config);
  await dragResize(page, config.locator('.block-resize-edge.bottom'), 60, -54);
  await expect.poll(async () => (await cardSize(config)).height).toBeLessThan(before.height);
  expect((await cardSize(config)).width).toBe(before.width);
  await expect(connection).toBeVisible();
  expect(await tableHeights()).toHaveLength(1);
});

test('fits all rows without vertical overflow at the maximum canvas size', async ({ page }) => {
  await page.goto('/');
  const table = canvasBlock(page, 'Transactions');
  await table.getByRole('button', { name: 'Open table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Transactions', exact: true });
  const footerRows = dialog.getByRole('spinbutton', { name: 'Footer rows' });
  await footerRows.fill('1');
  await footerRows.press('Tab');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Fit canvas', exact: true }).click();
  await waitForCanvasFit(page);
  const preview = table.locator('.node-inline');
  await dragResize(page, table.locator('.block-resize-edge.right'), 180, 0, .2);
  await dragResize(page, table.locator('.block-resize-edge.bottom'), 0, 220);
  await expect.poll(() => preview.evaluate((element) => ({
    horizontal: element.scrollWidth - element.clientWidth,
    vertical: element.scrollHeight - element.clientHeight,
  }))).toEqual({ horizontal: 0, vertical: 0 });
});

test('resizes an expanded table, scrolls to its last row and restores the size', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Long table');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Paste data', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Cell range' }).fill('Item\tAmount\n' + Array.from({ length: 72 }, (_, index) => 'Item ' + (index + 1) + '\t' + index).join('\n') + '\nTotal\t2556\nReviewed\t72');
  await page.getByRole('button', { name: 'Create table' }).click();
  const dialog = page.getByRole('dialog', { name: 'Pasted data' });
  const footerRows = dialog.getByRole('spinbutton', { name: 'Footer rows' });
  await footerRows.fill('2');
  await footerRows.press('Tab');
  await expect(dialog.locator('tfoot')).toBeInViewport({ ratio: .95 });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  const table = canvasBlock(page, 'Pasted data');
  await page.addStyleTag({ content: '.node-inline::-webkit-scrollbar { width: 0; height: 14px; }' });
  const footer = table.locator('tfoot');
  await expect(table.getByRole('textbox', { name: 'Item row 1', exact: true })).toBeVisible();
  await expect(footer.getByRole('textbox', { name: 'Item row 73', exact: true })).toHaveValue('Total');
  await expect(footer).toBeInViewport({ ratio: .95 });
  await table.getByRole('button', { name: 'Lock inline editing', exact: true }).click();
  await expect(table.getByRole('textbox', { name: 'Item row 1', exact: true })).toHaveCount(0);
  const full = page.getByRole('region', { name: 'Full table data' });
  const footerCoversScrollEdge = () => full.evaluate((element: HTMLElement) => {
    const bounds = element.getBoundingClientRect();
    const scale = bounds.height / element.offsetHeight;
    const viewportBottom = bounds.top + (element.clientTop + element.clientHeight) * scale;
    const footer = element.querySelector('tfoot')!;
    const edge = document.elementFromPoint(bounds.left + bounds.width / 2, viewportBottom - .25);
    return footer.getBoundingClientRect().bottom > viewportBottom && Boolean(edge && footer.contains(edge));
  });
  const initial = await cardSize(table);
  const left = table.locator('.block-resize-edge.left');
  await dragResize(page, left, 45, 0, .3);
  await expect.poll(async () => (await cardSize(table)).width).toBeLessThan(initial.width);
  await full.evaluate((element) => { element.scrollTop = 400; element.scrollLeft = 15; });
  await expect.poll(() => full.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(footerCoversScrollEdge).toBe(true);
  await dragResize(page, left, -95, 0, .3);
  await expect.poll(async () => Math.abs((await cardSize(table)).width - initial.width)).toBeLessThanOrEqual(2);
  await dragResize(page, table.locator('.block-resize-corner.top.right'), 30, -75);
  await expect.poll(async () => (await cardSize(table)).height).toBeGreaterThan(initial.height);
  const resized = await cardSize(table);
  await expect(full).toHaveAttribute('data-table-style', 'grid');
  await expect(full.getByRole('columnheader', { name: 'Item' })).toHaveCSS('border-right-width', '1px');
  await expect(full.getByRole('table')).toHaveAttribute('aria-rowcount', '75');
  await expect(footer).toBeInViewport({ ratio: .95 });
  await full.evaluate((element) => { element.scrollTop = 400; });
  await expect(footer).toBeInViewport({ ratio: .95 });
  await expect.poll(footerCoversScrollEdge).toBe(true);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await waitForCanvasFit(page);
  await expect.poll(footerCoversScrollEdge).toBe(true);
  await full.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(full.getByRole('cell', { name: 'Item 72', exact: true })).toBeAttached();
  await full.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(full.getByRole('cell', { name: 'Item 72', exact: true })).toBeInViewport();
  await expect(footer).toBeInViewport({ ratio: .95 });
  await page.getByRole('button', { name: 'Collapse table Pasted data', exact: true }).click();
  await expect(full).toHaveCount(0);
  await expect(footer.getByRole('cell', { name: 'Total', exact: true })).toBeInViewport();
  await expect(table.locator('.block-resize-corner')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand table Pasted data', exact: true }).click();
  await expect.poll(() => cardSize(table)).toEqual(resized);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => cardSize(table)).toEqual(resized);
  await table.getByRole('button', { name: 'Unlock inline editing', exact: true }).click();
  await expect(table.getByRole('textbox', { name: 'Item row 1', exact: true })).toBeVisible();
});

test('resizes columns and rows independently and fits their contents on double-click', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Table dimensions');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  await dialog.getByRole('button', { name: 'Column', exact: true }).click();
  await dialog.getByRole('button', { name: 'Row', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'B row 2', exact: true }).fill('First line\nSecond line');
  await dialog.getByRole('textbox', { name: 'B row 3', exact: true }).fill('M'.repeat(48));
  await dialog.getByRole('textbox', { name: 'B row 3', exact: true }).press('Enter');
  const grid = dialog.getByRole('table');
  const columns = () => grid.locator('thead th').evaluateAll((headers) => headers.map((cell) => (cell as HTMLElement).offsetWidth));
  const rows = (table: Locator) => table.locator('tbody tr').evaluateAll((rows) => rows.map((row) => (row as HTMLElement).offsetHeight));
  const initialColumns = await columns();
  const column = dialog.getByRole('button', { name: 'Resize column B', exact: true });
  await dragResize(page, column, 70, 0);
  const enlargedColumns = await columns();
  expect(enlargedColumns[2]).toBeCloseTo(initialColumns[2] + 70, 0);
  expect(enlargedColumns.filter((_, index) => index !== 2)).toEqual(initialColumns.filter((_, index) => index !== 2));
  await column.dblclick();
  const fittedColumns = await columns();
  expect(fittedColumns[2]).toBeGreaterThan(enlargedColumns[2]);
  expect(fittedColumns.filter((_, index) => index !== 2)).toEqual(initialColumns.filter((_, index) => index !== 2));

  const initialRows = await rows(grid);
  const row = dialog.getByRole('button', { name: 'Resize row 2', exact: true });
  await dragResize(page, row, 0, 64);
  const enlargedRows = await rows(grid);
  expect(enlargedRows).toEqual([initialRows[0], initialRows[1] + 64, initialRows[2]]);
  await row.dblclick();
  await expect.poll(() => rows(grid)).toEqual(initialRows);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const card = canvasBlock(page, 'Untitled table');
  await expect.poll(() => rows(card.getByRole('table'))).toEqual(enlargedRows);
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => rows(card.getByRole('table'))).toEqual(enlargedRows);
  await waitForCanvasFit(page);
  const canvasRow = card.getByRole('button', { name: 'Resize row 1', exact: true });
  await canvasRow.hover();
  await dragResize(page, canvasRow, 0, 35);
  await expect.poll(async () => (await rows(card.getByRole('table')))[0]).toBeGreaterThan(enlargedRows[0]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => rows(card.getByRole('table'))).toEqual(enlargedRows);
  await card.getByRole('button', { name: 'Lock inline editing', exact: true }).click();
  const locked = card.getByRole('region', { name: 'Full table data' });
  await expect.poll(async () => (await rows(locked.getByRole('table')))[1]).toBe(enlargedRows[1]);
  const lockedWidth = await locked.getByRole('columnheader', { name: 'B', exact: true }).evaluate((cell: HTMLElement) => cell.offsetWidth);
  expect(lockedWidth).toBeCloseTo(fittedColumns[2], 0);
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

test('creates a connected table from a table output and resolves its source in formulas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'total chart' })).toBeVisible();
  const picker = await dragOutput(page, 'Transactions', .20);
  await picker.getByRole('button', { name: /^Table/ }).click();
  const config = page.getByRole('dialog', { name: 'Configure table', exact: true });
  await expect(config).toContainText('Input: Transactions');
  const name = config.getByRole('textbox', { name: 'Name', exact: true });
  await name.fill('Transaction summary');
  await name.press('Enter');
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  await expect(inspector.getByRole('heading', { name: 'Transaction summary', exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Disconnect Transactions', exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Edit table', exact: true }).click();
  const table = page.getByRole('dialog', { name: 'Transaction summary', exact: true });
  const cell = table.getByRole('textbox', { name: 'A row 1', exact: true });
  await cell.fill('=MEDIAN(Transactions::Amount)');
  await cell.press('Enter');
  await expect(cell).toHaveValue('104.775');
});

test('stores config presets and supplies live values to table formulas and SQL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add config', exact: true }).click();
  const config = page.getByRole('dialog', { name: 'Create config', exact: true });
  await config.getByRole('textbox', { name: 'Name', exact: true }).fill('MeineConfig');
  await expect(config.getByRole('checkbox', { name: 'Show data types on canvas' })).not.toBeChecked();
  await expect(config.getByRole('region', { name: 'Presets', exact: true })).toHaveCount(0);
  const field = (name: string) => config.getByRole('region', { name, exact: true });
  let index = 0;
  const addField = async (name: string, type: string) => {
    await config.getByRole('button', { name: 'Add field', exact: true }).click();
    const input = field('Value' + ++index).getByRole('textbox', { name: 'Field name', exact: true });
    await input.fill(name);
    await input.press('Tab');
    await field(name).getByRole('combobox', { name: 'Control' }).selectOption(type);
  };
  await addField('SoliFactor', 'slider');
  for (const [name, value] of [['Maximum', '0.1'], ['Step', '0.05']]) {
    const input = field('SoliFactor').getByRole('spinbutton', { name, exact: true });
    await input.fill(value);
    await input.press('Tab');
  }
  const slider = field('SoliFactor').getByRole('slider', { name: 'SoliFactor' });
  await slider.press('End');
  await expect(slider).toHaveValue('0.1');
  await addField('Enabled', 'toggle');
  await field('Enabled').getByRole('checkbox', { name: 'Enabled' }).check();
  await addField('Note', 'input');
  const note = field('Note').getByRole('textbox', { name: 'Note', exact: true });
  await note.fill('Baseline');
  await note.press('Tab');
  const noteType = field('Note').getByRole('combobox', { name: 'Data type' });
  const create = config.getByRole('button', { name: 'Create config', exact: true });
  await noteType.selectOption('decimal');
  await expect(note).toHaveAttribute('aria-invalid', 'true');
  await expect(field('Note').getByRole('alert')).toContainText('Enter a number');
  await expect(create).toBeDisabled();
  await noteType.selectOption('text');
  await expect(note).toHaveAttribute('aria-invalid', 'false');
  await addField('Regions', 'multi');
  const options = field('Regions').getByRole('textbox', { name: 'Options (one per line)' });
  await options.fill('EU\nUS');
  await options.press('Tab');
  for (const option of ['EU', 'US']) await field('Regions').getByRole('checkbox', { name: option }).check();
  await create.click();
  const configCard = canvasBlock(page, 'MeineConfig');
  const grid = configCard.getByRole('table', { name: 'Config fields' });
  await expect(grid.getByRole('rowheader')).toHaveText(['SoliFactor', 'Enabled', 'Note', 'Regions']);
  await expect(grid.getByRole('row').first().getByRole('cell')).toHaveCount(1);
  const cardSlider = configCard.getByRole('slider', { name: 'SoliFactor' });
  const presetSelector = configCard.getByRole('combobox', { name: 'Preset', exact: true });
  const savePreset = configCard.getByRole('button', { name: 'Save preset', exact: true });
  await expect(savePreset).toBeDisabled();
  await createConfigPreset(page, configCard, 'Baseline');
  await cardSlider.press('Home');
  await configCard.getByRole('checkbox', { name: 'Enabled' }).uncheck();
  await configCard.getByRole('checkbox', { name: 'US', exact: true }).uncheck();
  await configCard.getByRole('button', { name: 'Load preset' }).click();
  await expect(cardSlider).toHaveValue('0.1');
  await expect(configCard.getByRole('checkbox', { name: 'Enabled' })).toBeChecked();
  await expect(configCard.getByRole('checkbox', { name: 'US', exact: true })).toBeChecked();
  const cardNote = configCard.getByRole('textbox', { name: 'Note', exact: true });
  await expect(cardNote).toHaveValue('Baseline');
  await cardNote.fill('Updated baseline');
  await savePreset.click();
  await cardNote.fill('Unsaved change');
  await configCard.getByRole('button', { name: 'Load preset' }).click();
  await expect(cardNote).toHaveValue('Updated baseline');
  await expect(presetSelector.getByRole('option', { name: 'Baseline', exact: true })).toHaveCount(1);

  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const table = page.getByRole('dialog', { name: 'Untitled table', exact: true });
  await table.getByRole('textbox', { name: 'A row 1', exact: true }).fill('120');
  await table.getByRole('button', { name: 'Done' }).click();
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  await inspector.getByRole('combobox', { name: 'Connect input' }).selectOption({ label: 'MeineConfig' });
  await inspector.getByRole('button', { name: 'Edit table', exact: true }).click();
  const formula = table.getByRole('textbox', { name: 'B row 1', exact: true });
  await formula.fill('=A1*MeineConfig.SoliFactor');
  await formula.press('Enter');
  await expect(formula).toHaveValue('12');
  await table.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Add SQL query', exact: true }).click();
  const sql = page.getByRole('dialog', { name: 'Edit SQL', exact: true });
  await sql.getByRole('combobox', { name: 'Connect input' }).selectOption({ label: 'MeineConfig' });
  await sql.getByRole('textbox', { name: 'SQL code' }).fill('SELECT SoliFactor AS factor FROM meineconfig;');
  await sql.getByRole('button', { name: 'Save and run' }).click();
  await expect(inspector.getByRole('cell', { name: '0.1', exact: true })).toBeVisible();

  await cardSlider.press('ArrowLeft');
  await expect(inspector.getByRole('cell', { name: '0.05', exact: true })).toBeVisible();
  const output = canvasBlock(page, 'Untitled table').getByRole('textbox', { name: 'B row 1', exact: true });
  await expect(output).toHaveValue('6');
  await presetSelector.selectOption({ label: 'Baseline' });
  await configCard.getByRole('button', { name: 'Load preset', exact: true }).click();
  await expect(cardSlider).toHaveValue('0.1');
  await configCard.getByRole('button', { name: 'Delete preset', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete preset?', exact: true });
  await confirmation.getByRole('button', { name: 'Delete preset', exact: true }).click();
  await expect(presetSelector.getByRole('option', { name: 'Baseline', exact: true })).toHaveCount(0);
  await expect(savePreset).toBeDisabled();
  await expect(output).toHaveValue('12');

  await configCard.getByRole('button', { name: 'Open config', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'MeineConfig', exact: true });
  await settings.getByRole('checkbox', { name: 'Show data types on canvas' }).check();
  await settings.getByRole('button', { name: 'Done', exact: true }).click();
  const dataTypes = grid.locator('tr > td:nth-child(2)');
  await expect(dataTypes).toHaveText(['Number', 'Boolean', 'Text', 'Auto']);
  await expect(grid.getByRole('row').first().getByRole('cell').last().getByRole('slider')).toHaveValue('0.1');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(dataTypes).toHaveText(['Number', 'Boolean', 'Text', 'Auto']);
  await configCard.getByRole('button', { name: 'Open config', exact: true }).click();
  await settings.getByRole('checkbox', { name: 'Show data types on canvas' }).uncheck();
  await settings.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(grid.getByRole('row').first().getByRole('cell')).toHaveCount(1);
});

test('uses global configs without connections and inserts a clicked cell at the formula cursor', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add config', exact: true }).click();
  const config = page.getByRole('dialog', { name: 'Create config', exact: true });
  await config.getByRole('textbox', { name: 'Name', exact: true }).fill('Tax');
  await config.getByRole('checkbox', { name: 'Global config', exact: true }).check();
  await config.getByRole('button', { name: 'Add field', exact: true }).click();
  const name = config.getByRole('textbox', { name: 'Field name', exact: true });
  await name.fill('Rate');
  await name.press('Tab');
  await config.getByRole('combobox', { name: 'Data type', exact: true }).selectOption('decimal');
  const rate = config.getByRole('textbox', { name: 'Rate', exact: true });
  await rate.fill('0,05');
  await rate.press('Tab');
  await config.getByRole('button', { name: 'Create config', exact: true }).click();

  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const table = page.getByRole('dialog', { name: 'Untitled table', exact: true });
  const base = table.getByRole('textbox', { name: 'A row 1', exact: true });
  const formula = table.getByRole('textbox', { name: 'B row 1', exact: true });
  await base.fill('120');
  await formula.fill('=0*Tax.Rate');
  await formula.evaluate((input: HTMLTextAreaElement) => input.setSelectionRange(1, 2));
  await base.click();
  await expect(formula).toBeFocused();
  await expect(formula).toHaveValue('=A1*Tax.Rate');
  await formula.press('Enter');
  await expect(formula).toHaveValue('6');
  await table.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Add SQL query', exact: true }).click();
  const sql = page.getByRole('dialog', { name: 'Edit SQL', exact: true });
  await expect(sql.getByText('tax · Global', { exact: true })).toBeVisible();
  await sql.getByRole('textbox', { name: 'SQL code' }).fill('SELECT Rate FROM "tax";');
  await sql.getByRole('button', { name: 'Save and run' }).click();
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  await expect(inspector.getByRole('cell', { name: '0.05', exact: true })).toBeVisible();

  const configCard = canvasBlock(page, 'Tax');
  await configCard.getByRole('button', { name: 'Open config', exact: true }).click();
  const existingConfig = page.getByRole('dialog', { name: 'Tax', exact: true });
  await existingConfig.getByRole('checkbox', { name: 'Global config', exact: true }).uncheck();
  await existingConfig.getByRole('button', { name: 'Done' }).click();
  const output = canvasBlock(page, 'Untitled table').getByRole('textbox', { name: 'B row 1', exact: true });
  await expect(output).toHaveValue('#ERROR');
  await configCard.getByRole('button', { name: 'Open config', exact: true }).click();
  await existingConfig.getByRole('checkbox', { name: 'Global config', exact: true }).check();
  await existingConfig.getByRole('button', { name: 'Done' }).click();
  await expect(output).toHaveValue('6');
});

test('switches named presets for connected and global configs, including with no input links', async ({ page }) => {
  await page.goto('/');
  const draft = page.getByRole('dialog', { name: 'Create config', exact: true });
  async function setupConfig(title: string, global: boolean, low: string, high: string) {
    await page.getByRole('button', { name: 'Add config', exact: true }).click();
    await draft.getByRole('textbox', { name: 'Name', exact: true }).fill(title);
    if (global) await draft.getByRole('checkbox', { name: 'Global config', exact: true }).check();
    await draft.getByRole('button', { name: 'Add field', exact: true }).click();
    const name = draft.getByRole('textbox', { name: 'Field name', exact: true });
    await name.fill('Rate');
    await name.press('Tab');
    await draft.getByRole('button', { name: 'Create config', exact: true }).click();
    const card = canvasBlock(page, title);
    const value = card.getByRole('textbox', { name: 'Rate', exact: true });
    for (const [label, text] of [['Low', low], ['High', high]]) {
      await value.fill(text);
      await value.press('Tab');
      await createConfigPreset(page, card, label);
    }
    const selector = card.getByRole('combobox', { name: 'Preset', exact: true });
    const save = card.getByRole('button', { name: 'Save preset', exact: true });
    await selector.selectOption({ label: 'Low' });
    await expect(save).toBeDisabled();
    await expect(value).toHaveValue(high);
    await selector.selectOption({ label: 'High' });
    await expect(save).toBeEnabled();
    return value;
  }
  const global = await setupConfig('GlobalTax', true, '1', '2');
  const local = await setupConfig('LocalTax', false, '3', '4');
  await page.getByRole('button', { name: 'Add switch', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Configure switch', exact: true });
  const name = setup.getByRole('textbox', { name: 'Name', exact: true });
  await name.fill('Tax mode');
  await name.press('Tab');
  for (const [letter, label] of [['A', 'Low'], ['B', 'High']]) {
    const option = setup.getByRole('textbox', { name: 'Option ' + letter, exact: true });
    await option.fill(label);
    await option.press('Tab');
    await setup.getByRole('group', { name: 'GlobalTax', exact: true })
      .getByRole('combobox', { name: 'Preset for ' + label, exact: true }).selectOption({ label });
  }
  await setup.getByRole('button', { name: 'Done', exact: true }).click();
  const control = canvasBlock(page, 'Tax mode');
  await control.getByRole('button', { name: 'Apply Low', exact: true }).click();
  await expect(global).toHaveValue('1');
  await expect(local).toHaveValue('4');
  await control.getByRole('button', { name: 'Configure switch', exact: true }).click();
  await setup.getByRole('combobox', { name: 'Connect config', exact: true }).selectOption({ label: 'LocalTax' });
  for (const label of ['Low', 'High']) {
    await setup.getByRole('group', { name: 'LocalTax', exact: true })
      .getByRole('combobox', { name: 'Preset for ' + label, exact: true }).selectOption({ label });
  }
  await setup.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const table = page.getByRole('dialog', { name: 'Untitled table', exact: true });
  await table.getByRole('button', { name: 'Done', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  await inspector.getByRole('combobox', { name: 'Connect input', exact: true }).selectOption({ label: 'Tax mode' });
  await inspector.getByRole('button', { name: 'Edit table', exact: true }).click();
  const formula = table.getByRole('textbox', { name: 'A row 1', exact: true });
  await formula.fill('=GlobalTax.Rate+LocalTax.Rate');
  await formula.press('Enter');
  await expect(formula).toHaveValue('5');
  await table.getByRole('button', { name: 'Done', exact: true }).click();
  const output = canvasBlock(page, 'Untitled table').getByRole('textbox', { name: 'A row 1', exact: true });
  const query = page.getByRole('dialog', { name: 'Edit SQL' });
  async function addQuery(title: string, code: string) {
    await page.getByRole('button', { name: 'Add SQL query', exact: true }).click();
    await query.getByRole('combobox', { name: 'Connect input' }).selectOption({ label: 'Untitled table' });
    await query.getByRole('textbox', { name: 'SQL code' }).fill(code);
    await query.getByRole('button', { name: 'Save and run' }).click();
    const card = canvasBlock(page, 'Untitled SQL query');
    await card.getByRole('button', { name: 'Rename Untitled SQL query', exact: true }).click();
    const name = card.getByRole('textbox', { name: 'Block name', exact: true });
    await name.fill(title);
    await name.press('Enter');
    const renamed = canvasBlock(page, title);
    await renamed.getByRole('button', { name: 'Results', exact: true }).click();
    return renamed.getByRole('region', { name: 'Query results' });
  }
  const used = await addQuery('Reads tax table', 'SELECT A FROM untitled_table WHERE A IS NOT NULL');
  await expect(used.getByRole('cell', { name: '5', exact: true })).toBeVisible();
  const unused = await addQuery('Ignores tax table', 'SELECT 42 AS answer');
  await expect(unused.getByRole('cell', { name: '42', exact: true })).toBeVisible();

  const settings = page.getByRole('dialog', { name: 'Settings' });
  const automatic = settings.getByRole('checkbox', { name: 'Automatically refresh computed blocks when inputs change' });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await automatic.uncheck();
  await settings.getByRole('button', { name: 'Done' }).click();
  await control.getByRole('button', { name: 'Apply Low', exact: true }).click();
  await expect(output).toHaveValue('4');
  await expect(used.getByRole('cell', { name: '5', exact: true })).toBeVisible();
  await expect(canvasBlock(page, 'Reads tax table').getByText('Needs run', { exact: true })).toBeVisible();
  await expect(canvasBlock(page, 'Ignores tax table').getByText('Needs run', { exact: true })).toHaveCount(0);
  await expect(canvasBlock(page, 'Monthly totals').getByText('Needs run', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await automatic.check();
  await settings.getByRole('button', { name: 'Done' }).click();
  await expect(used.getByRole('cell', { name: '4', exact: true })).toBeVisible();
  const globalCard = canvasBlock(page, 'GlobalTax');
  const globalPresets = globalCard.getByRole('combobox', { name: 'Preset', exact: true });
  await globalPresets.selectOption({ label: 'High' });
  await globalCard.getByRole('button', { name: 'Edit preset', exact: true }).click();
  const rename = page.getByRole('dialog', { name: 'Rename preset', exact: true });
  const presetName = rename.getByRole('textbox', { name: 'Preset name', exact: true });
  await expect(presetName).toHaveValue('High');
  await presetName.fill('low');
  await presetName.press('Enter');
  await expect(rename.getByRole('alert')).toContainText('A preset with that name already exists.');
  await presetName.fill('Forecast');
  await presetName.press('Enter');
  await expect(globalPresets.locator('option:checked')).toHaveText('Forecast');
  await expect(output).toHaveValue('4');
  await control.getByRole('button', { name: 'Switch to High', exact: true }).click();
  await expect(output).toHaveValue('6');
  await expect(used.getByRole('cell', { name: '6', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(output).toHaveValue('4');
});

test('switches the SQL card between code and scrollable results and saves the choice', async ({ page }) => {
  await page.goto('/');
  const card = canvasBlock(page, 'Monthly totals');
  const toggle = card.getByRole('group', { name: 'SQL preview', exact: true });
  const showSql = toggle.getByRole('button', { name: 'SQL', exact: true });
  const showResults = toggle.getByRole('button', { name: 'Results', exact: true });
  const results = card.getByRole('region', { name: 'Query results', exact: true });
  await expect(showSql).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.node-code')).toContainText('FROM transactions');
  await showResults.click();
  await expect(showResults).toHaveAttribute('aria-pressed', 'true');
  await expect(results.getByRole('cell', { name: '1080.20', exact: true })).toBeVisible();
  await showSql.click();
  await expect(results).toHaveCount(0);
  await expect(card.locator('.node-code')).toBeVisible();
  await showResults.click();

  await card.getByRole('button', { name: 'Open query', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit SQL', exact: true });
  await editor.getByRole('textbox', { name: 'SQL code', exact: true }).fill('SELECT i AS entry FROM range(1, 41) t(i);');
  await editor.getByRole('button', { name: 'Save and run', exact: true }).click();
  await expect(results.getByRole('table')).toHaveAttribute('aria-rowcount', '41');
  await results.evaluate((element) => element.scrollTop = element.scrollHeight);
  await expect(results.getByRole('cell', { name: '40', exact: true })).toBeVisible();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(showResults).toHaveAttribute('aria-pressed', 'true');
  await expect(results.getByRole('columnheader', { name: 'entry' })).toBeVisible();

  await page.getByRole('button', { name: 'Add SQL query', exact: true }).click();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  const newCard = canvasBlock(page, 'Untitled SQL query');
  await newCard.getByRole('button', { name: 'Results', exact: true }).click();
  await expect(newCard.getByText('Run the query to see results.', { exact: true })).toBeVisible();
  await newCard.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(newCard.getByRole('cell', { name: '42', exact: true })).toBeVisible();
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
  const confirmation = page.getByRole('dialog', { name: 'Delete block?', exact: true });
  await page.keyboard.press('Delete');
  await expect(confirmation).toContainText('Household spending');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(table).toBeVisible();
  await page.getByRole('complementary', { name: 'Workspace blocks' }).getByRole('button', { name: 'Household spending', exact: true }).click();
  await page.keyboard.press('Delete');
  await confirmation.getByRole('button', { name: 'Delete block', exact: true }).click();
  await expect(table).toHaveCount(0);
  await undo.click();
  await expect(table).toBeVisible();
  await redo.click();
  await expect(table).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(table).toBeVisible();
  await inspector.getByRole('button', { name: 'Delete block' }).click();
  await confirmation.getByRole('button', { name: 'Delete block', exact: true }).click();
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
  const connector = table.locator('.quick-exit');
  await table.locator('.node-heading').hover({ trial: true });
  const exit = (await connector.boundingBox())!;
  const nearby = { x: exit.x + exit.width * 1.5, y: exit.y + exit.height * .5 };
  await page.mouse.move(nearby.x + 80, nearby.y);
  await expect(connector).toHaveCSS('opacity', '0');
  await page.mouse.move(nearby.x, nearby.y, { steps: 8 });
  await expect(connector).toHaveCSS('opacity', '1');
  await expect(inlineTable.getByRole('textbox', { name: /^[AB] row [12]$/ })).toHaveCount(4);
  await expect(inlineTable.getByRole('table').locator('tbody tr')).toHaveCount(2);
  await inlineTable.getByRole('textbox', { name: 'A row 1', exact: true }).fill('2');
  await expect(columnHeader(inlineTable, 'A')).toContainText('Auto');
  await inlineTable.getByRole('textbox', { name: 'A row 2', exact: true }).fill('99');
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  const tableOptions = inspector.getByRole('region', { name: 'Table options' });
  await expect(inlineTable.getByRole('spinbutton', { name: 'Title columns' })).toHaveCount(0);
  await tableOptions.getByRole('spinbutton', { name: 'Title columns' }).fill('1');
  await tableOptions.getByRole('spinbutton', { name: 'Title columns' }).press('Tab');
  await tableOptions.getByRole('spinbutton', { name: 'Footer rows' }).fill('1');
  await tableOptions.getByRole('spinbutton', { name: 'Footer rows' }).press('Tab');
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
  await inspector.getByRole('button', { name: 'Data', exact: true }).click();
  await expect(inspector.getByRole('cell', { name: '5', exact: true })).toBeVisible();
  await expect(inspector.getByRole('cell', { name: '104', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add chart', exact: true }).dragTo(dropArea, { targetPosition: { x: 40, y: 395 } });
  const chart = canvasBlock(page, 'Untitled chart');
  const chartDialog = page.getByRole('dialog', { name: 'Untitled chart' });
  await chartDialog.getByRole('combobox', { name: 'Source' }).selectOption({ label: 'Untitled table' });
  await chartDialog.getByRole('combobox', { name: 'Chart type' }).selectOption('line');
  await chartDialog.getByRole('combobox', { name: 'X axis' }).selectOption('B');
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
  await canvasBlock(page, 'Untitled group').getByText('Untitled group', { exact: true }).click();
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

  const beforeGroupDrag = (await outerCard.boundingBox())!;
  const beforeChildDrag = (await table.boundingBox())!;
  const zoom = beforeGroupDrag.width / (await outerSize()).width;
  const dragStart = { x: beforeGroupDrag.x + 12 * zoom, y: beforeGroupDrag.y + 82 * zoom };
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x - 40, dragStart.y + 25, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await outerCard.boundingBox())!.x).toBeLessThan(beforeGroupDrag.x - 30);
  const afterGroupDrag = (await outerCard.boundingBox())!;
  const afterChildDrag = (await table.boundingBox())!;
  expect(afterChildDrag.x - afterGroupDrag.x).toBeCloseTo(beforeChildDrag.x - beforeGroupDrag.x);
  expect(afterChildDrag.y - afterGroupDrag.y).toBeCloseTo(beforeChildDrag.y - beforeGroupDrag.y);

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

test('focusing a collapsed group shows nested members and their external inputs and outputs', async ({ page }) => {
  await page.goto('/');
  await canvasBlock(page, 'Monthly totals').waitFor();
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  const sidebar = page.getByRole('complementary', { name: 'Workspace blocks' });
  const parent = inspector.getByRole('combobox', { name: 'Group', exact: true });

  async function addGroup(title: string) {
    await page.getByRole('button', { name: 'Add group', exact: true }).click();
    await canvasBlock(page, 'Untitled group').getByText('Untitled group', { exact: true }).click();
    const name = page.getByRole('textbox', { name: 'Block name' });
    await name.fill(title);
    await name.press('Enter');
  }

  await addGroup('Budget group');
  await addGroup('Queries');
  await parent.selectOption({ label: 'Budget group' });
  await sidebar.getByRole('button', { name: 'Monthly totals', exact: true }).click();
  await parent.selectOption({ label: 'Queries' });
  await addGroup('Unrelated group');

  const outer = canvasBlock(page, 'Budget group');
  const inner = canvasBlock(page, 'Queries');
  const query = canvasBlock(page, 'Monthly totals');
  await inner.getByRole('button', { name: 'Collapse group Queries' }).click();
  await outer.getByRole('button', { name: 'Collapse group Budget group' }).click();
  await expect(query).toHaveCount(0);

  const search = page.getByRole('combobox', { name: 'Find a block' });
  await search.fill('Budget group');
  await search.press('Enter');
  await expect(outer.locator('.group-card')).not.toHaveClass(/collapsed/);
  await expect(outer.locator('.group-card')).toHaveCSS('border-top-width', '2px');
  await expect(inner.locator('.group-card')).toHaveCSS('border-top-width', '1px');
  await expect(inner.locator('.group-card')).not.toHaveClass(/collapsed/);
  await expect(query).toBeVisible();
  await expect(canvasBlock(page, 'Unrelated group')).toHaveCount(0);

  const input = canvasBlock(page, 'Transactions');
  const output = canvasBlock(page, 'Spending by month');
  await expect(input.locator('.node-relationship')).toHaveText('input');
  await expect(output.locator('.node-relationship')).toHaveText('output');
  await expect(page.getByRole('group', { name: 'Connection from Transactions to Monthly totals' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Connection from Monthly totals to Spending by month' })).toBeVisible();
  await expect(input).toBeInViewport({ ratio: .9 });
  await expect(output).toBeInViewport({ ratio: .9 });
  const [frame, upstream, downstream, child] = await Promise.all([outer.boundingBox(), input.boundingBox(), output.boundingBox(), query.boundingBox()]);
  expect(upstream!.x + upstream!.width).toBeLessThan(frame!.x);
  expect(downstream!.x).toBeGreaterThan(frame!.x + frame!.width);
  expect(child!.x).toBeGreaterThan(frame!.x);
  expect(child!.x + child!.width).toBeLessThan(frame!.x + frame!.width);

  await page.getByRole('button', { name: 'Exit focus view' }).click();
  await expect(outer.getByRole('button', { name: 'Expand group Budget group' })).toBeVisible();
  await expect(inner).toHaveCount(0);
  await outer.getByRole('button', { name: 'Expand group Budget group' }).click();
  await expect(inner.getByRole('button', { name: 'Expand group Queries' })).toBeVisible();
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
  const shortcut = settings.getByRole('button', { name: 'Change shortcut for Delete selection' });
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

test('refreshes dependent queries and charts by default and keeps previous results when paused', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.getByRole('complementary', { name: 'Workspace blocks' });
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  const settingsButton = page.getByRole('button', { name: 'Settings', exact: true });
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const automatic = settings.getByRole('checkbox', { name: 'Automatically refresh computed blocks when inputs change' });
  await settingsButton.click();
  await expect(automatic).toBeChecked();
  await settings.getByRole('button', { name: 'Done' }).click();
  await expect(canvasBlock(page, 'Spending by month').getByRole('img', { name: 'total chart' })).toBeVisible();

  await page.getByRole('button', { name: 'Add SQL query', exact: true }).click();
  const sql = page.getByRole('dialog', { name: 'Edit SQL' });
  await sql.getByRole('combobox', { name: 'Connect input' }).selectOption({ label: 'Monthly totals' });
  await sql.getByRole('textbox', { name: 'SQL code' }).fill("SELECT total FROM monthly_totals WHERE month = '2026-01';");
  await sql.getByRole('button', { name: 'Save and run' }).click();
  await expect(inspector.getByRole('cell', { name: '1080.20', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Add chart', exact: true }).click();
  const chart = page.getByRole('dialog', { name: 'Untitled chart' });
  await chart.getByRole('combobox', { name: 'Source' }).selectOption({ label: 'Transactions' });
  await expect(chart.getByRole('img', { name: 'Amount chart' })).toBeVisible();
  await chart.getByRole('button', { name: 'Done' }).click();
  const tableChart = canvasBlock(page, 'Untitled chart');
  const selectBlock = (name: string) => sidebar.getByRole('button', { name, exact: true }).click();
  const seeQuery = async (name: string, value: string) => {
    await selectBlock(name);
    await inspector.getByRole('button', { name: 'Data', exact: true }).click();
    await expect(inspector.getByRole('cell', { name: value, exact: true })).toBeVisible();
  };
  const editAmount = async (...values: string[]) => {
    await selectBlock('Transactions');
    await inspector.getByRole('button', { name: 'Edit table', exact: true }).click();
    const table = page.getByRole('dialog', { name: 'Transactions' });
    for (const value of values) await table.getByRole('textbox', { name: 'Amount row 1', exact: true }).fill(value);
    await table.getByRole('button', { name: 'Done' }).click();
  };

  await editAmount('900.00', '950.00');
  await seeQuery('Untitled SQL query', '1180.20');
  await expect(tableChart.getByText('Previous data', { exact: false })).toHaveCount(0);
  await settingsButton.click();
  await automatic.uncheck();
  await settings.getByRole('button', { name: 'Done' }).click();
  await editAmount('1000.00');
  await seeQuery('Monthly totals', '1180.20');
  await expect(inspector.getByText('Previous result', { exact: true })).toBeVisible();
  await expect(tableChart.getByText('Previous data', { exact: false })).toBeVisible();
  await inspector.getByRole('button', { name: 'Run query', exact: true }).click();
  await expect(inspector.getByRole('cell', { name: '1230.20', exact: true })).toBeVisible();
  await selectBlock('Untitled chart');
  await inspector.getByRole('button', { name: 'Refresh chart', exact: true }).click();
  await expect(tableChart.getByText('Previous data', { exact: false })).toHaveCount(0);

  await settingsButton.click();
  await automatic.check();
  await settings.getByRole('button', { name: 'Done' }).click();
  await seeQuery('Untitled SQL query', '1230.20');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await seeQuery('Untitled SQL query', '1180.20');
  await settingsButton.click();
  await automatic.uncheck();
  await settings.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await settingsButton.click();
  await expect(automatic).not.toBeChecked();
});

test('calculates table sums, keeps formula references after rename, and handles deletion and zero-based rows', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Formula budget');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const table = page.getByRole('dialog', { name: 'Untitled table' });
  await expect(columnHeader(table, 'A')).toContainText('Auto');
  await table.getByRole('combobox', { name: 'First row' }).selectOption('0');
  const columnSettings = page.getByRole('dialog', { name: 'Column settings', exact: true });
  await columnHeader(table, 'A').dblclick();
  const name = columnSettings.getByRole('textbox', { name: 'Name', exact: true });
  await name.fill('Amount');
  await columnSettings.getByRole('combobox', { name: 'Data type' }).selectOption('decimal');
  await columnSettings.getByRole('button', { name: 'Save', exact: true }).click();
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
  await footer.fill('=CONCAT("Summe: ", SUM())');
  await footer.press('Enter');
  await expect(footer).toHaveValue('Summe: 0.3');
  await expect(footer).not.toHaveAttribute('aria-invalid', 'true');
  await expect(table.getByRole('status')).toHaveCount(0);
  await columnHeader(table, 'Amount').dblclick();
  await name.fill('Revenue');
  await name.press('Enter');
  await expect(namedSum).toHaveValue('0.3');
  await namedSum.focus();
  await expect(namedSum).toHaveValue('=SUM(Revenue)');
  await columnHeader(table, 'Revenue').dblclick();
  await columnSettings.getByRole('button', { name: 'Delete column Revenue', exact: true }).click();
  await expect(namedSum).toHaveAttribute('aria-invalid', 'true');
  await expect(namedSum).toHaveValue('#ERROR');
  await columnHeader(table, 'B').dblclick();
  await expect(columnSettings.getByRole('button', { name: 'Delete column B', exact: true })).toBeDisabled();
  await columnSettings.getByRole('button', { name: 'Cancel', exact: true }).click();
  await table.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const canvasTable = canvasBlock(page, 'Untitled table');
  await expect(canvasTable.getByRole('textbox', { name: 'B row 0', exact: true })).toHaveValue('0.3');
});

test('suggests formulas in both table editors and uses Return to accept suggestions and cells', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Suggested formulas');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  const first = dialog.getByRole('textbox', { name: 'A row 1', exact: true });
  await first.fill("'=");
  await expect(page.getByRole('listbox', { name: 'Formula suggestions' })).toHaveCount(0);
  await first.press('Enter');
  await expect(first).toHaveValue('=');
  await expect(dialog.getByRole('textbox', { name: 'A row 2', exact: true }).locator('xpath=ancestor::td')).toBeFocused();

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
  await columnHeader(canvasBlock(page, 'Untitled table'), 'A').dblclick();
  const columnSettings = page.getByRole('dialog', { name: 'Column settings', exact: true });
  await columnSettings.getByRole('textbox', { name: 'Name', exact: true }).fill('Category');
  await columnSettings.getByRole('button', { name: 'Save', exact: true }).click();
  await inline.fill('=CONCAT("DISTINCT:", COUNT(DISTINCT(Category)))');
  await inline.press('Enter');
  await expect(inline).toHaveValue('DISTINCT:1');
  const bottom = canvasBlock(page, 'Untitled table').getByRole('textbox', { name: 'B row 2', exact: true });
  const bottomCell = bottom.locator('xpath=ancestor::td');
  await expect(bottomCell).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(canvasBlock(page, 'Untitled table').getByRole('textbox', { name: 'Category row 2', exact: true })
    .locator('xpath=ancestor::td')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  await expect(inline.locator('xpath=ancestor::td')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(bottomCell).toBeFocused();
  await page.evaluate(() => history.pushState({}, '', '#cell-navigation'));
  await page.keyboard.press('Meta+ArrowLeft');
  await expect(canvasBlock(page, 'Untitled table').getByRole('textbox', { name: 'Category row 2', exact: true })
    .locator('xpath=ancestor::td')).toBeFocused();
  await expect(page).toHaveURL(/#cell-navigation$/);
  await page.keyboard.press('Meta+ArrowRight');
  await expect(bottomCell).toBeFocused();
  await page.keyboard.press('Meta+ArrowUp');
  await expect(inline.locator('xpath=ancestor::td')).toBeFocused();
  await page.keyboard.press('Meta+ArrowDown');
  await expect(bottomCell).toBeFocused();
  await page.keyboard.type('Done');
  await bottom.press('Enter');
  await expect(bottom).toHaveValue('Done');
  await expect(bottomCell).toBeFocused();
});

test('inserts and saves line breaks with Shift+Enter in both table editors', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Multiline notes');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  const first = dialog.getByRole('textbox', { name: 'A row 1', exact: true });
  await first.fill('FirstSecond');
  await first.evaluate((cell: HTMLTextAreaElement) => cell.setSelectionRange(5, 5));
  await first.press('Shift+Enter');
  await expect(first).toHaveValue('First\nSecond');
  await expect(first).toBeFocused();
  await first.press('Enter');
  await expect(first).not.toBeFocused();
  await expect(first).toHaveAttribute('rows', '2');
  await expect(dialog.getByRole('textbox', { name: 'A row 2', exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Done' }).click();

  const table = canvasBlock(page, 'Untitled table');
  const inline = table.getByRole('textbox', { name: 'B row 1', exact: true });
  await inline.fill('Third');
  await inline.press('Shift+Enter');
  await page.keyboard.insertText('Fourth');
  await inline.press('Enter');
  await expect(inline).toHaveValue('Third\nFourth');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(table.getByRole('textbox', { name: 'A row 1', exact: true })).toHaveValue('First\nSecond');
  await expect(inline).toHaveValue('Third\nFourth');
});

test('shows nested functions and searchable documentation for the active cell', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Function reference');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  const dialogInspector = dialog.getByRole('complementary', { name: 'Table inspector' });
  await dialog.getByRole('textbox', { name: 'A row 1', exact: true }).fill('Groceries');
  const formula = '=CONCAT("MAX(A): ", COUNT(DISTINCT(A)), COUNT(A))';
  const dialogCell = dialog.getByRole('textbox', { name: 'B row 1', exact: true });
  await dialogCell.fill(formula);
  await dialogCell.press('Enter');
  await expect(dialogCell).toHaveValue('MAX(A): 11');
  await dialogCell.click();
  const usedInDialog = dialogInspector.getByRole('region', { name: 'Functions in this cell' });
  await expect(usedInDialog.locator('summary')).toHaveText(['CONCAT', 'COUNT', 'DISTINCT']);
  await usedInDialog.locator('summary').filter({ hasText: 'DISTINCT' }).click();
  await expect(usedInDialog.getByText('Use inside COUNT to count unique nonempty values.', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  const table = canvasBlock(page, 'Untitled table');
  const inlineCell = table.getByRole('textbox', { name: 'B row 1', exact: true });
  await inlineCell.click();
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  const options = inspector.getByRole('region', { name: 'Cell options' });
  await expect(options.getByText('B1', { exact: true })).toBeVisible();
  await expect(options.getByLabel('Cell formula')).toHaveText(formula);
  const used = options.getByRole('region', { name: 'Functions in this cell' });
  await expect(used.locator('summary')).toHaveText(['CONCAT', 'COUNT', 'DISTINCT']);
  const catalog = options.getByRole('region', { name: 'Function catalog' });
  await expect(catalog.locator('summary')).toHaveCount(19);
  const search = catalog.getByRole('searchbox', { name: 'Search functions' });
  await search.fill('mEdIaN');
  await expect(inlineCell).not.toBeFocused();
  await expect(catalog.locator('summary')).toHaveText(['MEDIAN']);
  await catalog.locator('summary').click();
  await expect(catalog.getByText('=MEDIAN(Amount)', { exact: true })).toBeVisible();
  await search.fill('unknown function');
  await expect(catalog.getByText('No matching functions.')).toBeVisible();
  await search.clear();
  await expect(catalog.locator('summary')).toHaveCount(19);

  await inspector.getByRole('button', { name: 'Delete block' }).scrollIntoViewIfNeeded();
  await table.getByRole('textbox', { name: 'B row 2', exact: true }).fill("'=MAX(A)");
  await expect(options.getByRole('heading', { name: 'Cell options' })).toBeInViewport();
  await expect(options.getByText('B2', { exact: true })).toBeVisible();
  await expect(used.getByText('No functions in this cell.')).toBeVisible();
  await expect(options.getByLabel('Cell formula')).toHaveCount(0);
  await options.getByRole('button', { name: 'Clear cell selection' }).click();
  await expect(options).toHaveCount(0);

  await inlineCell.fill('=XO');
  const suggestions = page.getByRole('listbox', { name: 'Formula suggestions' });
  await expect(suggestions.getByRole('option', { name: /^XOR/ })).toBeVisible();
  await inlineCell.fill('=AND(TRUE, NOT(FALSE))');
  await inlineCell.press('Enter');
  await expect(inlineCell).toHaveValue('true');
  await expect(options.getByText('B2', { exact: true })).toBeVisible();
  await inlineCell.click();
  await expect(used.locator('summary')).toHaveText(['AND', 'NOT']);
});

test('formats cells and pastes a copied style into a range without changing its contents', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Cell formatting');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  const cell = (section: Locator, address: string) => section.getByRole('textbox', { name: address, exact: true });
  await cell(dialog, 'A row 2').fill('One');
  await cell(dialog, 'B row 2').fill('Two');
  const formula = cell(dialog, 'B row 1');
  await formula.fill('=CONCAT("Keep", " me")');
  await formula.press('Enter');
  const source = cell(dialog, 'A row 1');
  await source.fill('Source');

  const format = dialog.getByRole('region', { name: 'Cell formatting' });
  for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough']) {
    const button = format.getByRole('button', { name, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  await format.getByRole('combobox', { name: 'Font', exact: true }).selectOption('serif');
  const size = format.getByRole('spinbutton', { name: 'Font size' });
  await size.fill('25');
  await size.press('Tab');
  await format.getByRole('button', { name: 'Align center', exact: true }).click();
  await format.getByRole('button', { name: 'Align bottom', exact: true }).click();
  for (const [label, color] of [['Font color', '#142850'], ['Background color', '#f0d895']]) {
    await format.getByRole('button', { name: label, exact: true }).click();
    const picker = page.getByRole('dialog', { name: label, exact: true });
    await picker.getByLabel('Custom color').fill(color);
    await picker.getByRole('button', { name: 'Apply', exact: true }).click();
  }
  const expectStyle = async (cell: Locator) => {
    await expect(cell).toHaveCSS('color', 'rgb(20, 40, 80)');
    await expect(cell).toHaveCSS('font-size', '25px');
    await expect(cell).toHaveCSS('font-family', 'serif');
    await expect(cell).toHaveCSS('font-style', 'italic');
    await expect(cell).toHaveCSS('font-weight', '700');
    await expect(cell).toHaveCSS('text-decoration-line', 'underline line-through');
    await expect(cell).toHaveCSS('text-align', 'center');
    await expect(cell.locator('xpath=ancestor::td')).toHaveCSS('background-color', 'rgb(240, 216, 149)');
    await expect(cell.locator('xpath=ancestor::td')).toHaveCSS('vertical-align', 'bottom');
  };
  await expectStyle(source);
  await source.press('Alt+Meta+c');
  await expect(format.getByRole('button', { name: 'Paste cell style', exact: true })).toBeEnabled();
  await formula.press('Alt+Meta+v');
  await formula.press('Enter');
  await expect(formula).toHaveValue('Keep me');
  await expectStyle(formula);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();

  const card = canvasBlock(page, 'Untitled table');
  const first = cell(card, 'A row 2');
  const second = cell(card, 'B row 2');
  await first.click();
  await second.click({ modifiers: ['Shift'] });
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  await expect(inspector.getByText('A2:B2', { exact: true })).toBeVisible();
  await expect(card.locator('td.range-cell')).toHaveCount(2);
  await page.keyboard.press('Alt+Meta+v');
  await expectStyle(first);
  await expectStyle(second);
  await expect(first).toHaveValue('One');
  await expect(second).toHaveValue('Two');

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(first).not.toHaveCSS('font-size', '25px');
  await expect(second).not.toHaveCSS('font-size', '25px');
  await expectStyle(cell(card, 'B row 1'));
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expectStyle(first);
  await expectStyle(second);
  await card.getByRole('button', { name: 'Lock inline editing', exact: true }).click();
  const locked = card.getByRole('region', { name: 'Full table data' });
  const styled = locked.getByRole('cell', { name: 'One', exact: true });
  await expect(styled).toHaveCSS('background-color', 'rgb(240, 216, 149)');
  await expect(styled).toHaveCSS('font-size', '25px');
});

test('toggles bold, italic and underline with shortcuts on selected cells', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table', exact: true });
  const first = dialog.getByRole('textbox', { name: 'A row 1', exact: true });
  const second = dialog.getByRole('textbox', { name: 'B row 1', exact: true });
  await first.fill('Keep this');
  await first.press('Enter');
  await second.click({ modifiers: ['Shift'] });
  const format = dialog.getByRole('region', { name: 'Cell formatting' });
  for (const [shortcut, label, property, on, off] of [
    ['Meta+b', 'Bold', 'font-weight', '700', '400'],
    ['Meta+i', 'Italic', 'font-style', 'italic', 'normal'],
    ['Meta+u', 'Underline', 'text-decoration-line', 'underline', 'none'],
  ]) {
    await page.keyboard.press(shortcut);
    await expect(format.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(first).toHaveCSS(property, on);
    await expect(second).toHaveCSS(property, on);
    await page.keyboard.press(shortcut);
    await expect(first).toHaveCSS(property, off);
    await expect(second).toHaveCSS(property, off);
  }
  await expect(first).toHaveValue('Keep this');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Fit canvas', exact: true }).click();
  await waitForCanvasFit(page);
  const card = canvasBlock(page, 'Untitled table');
  await card.getByRole('button', { name: 'Select row 1', exact: true }).click();
  await page.keyboard.press('Meta+b');
  await expect(card.getByRole('textbox', { name: 'B row 1', exact: true })).toHaveCSS('font-weight', '700');
  await page.keyboard.press('Meta+z');
  await expect(card.getByRole('textbox', { name: 'B row 1', exact: true })).toHaveCSS('font-weight', '400');
});

test('copies the individual cell styles of a row or column without changing formulas or values', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const table = page.getByRole('dialog', { name: 'Untitled table', exact: true });
  await table.getByRole('button', { name: 'Column', exact: true }).click();
  await table.getByRole('button', { name: 'Row', exact: true }).click();
  const cell = (name: string) => table.getByRole('textbox', { name, exact: true });
  const background = (name: string) => cell(name).locator('xpath=ancestor::td');
  const setBackground = async (name: string, color: string) => {
    await cell(name).click();
    await table.getByRole('button', { name: 'Background color', exact: true }).click();
    const palette = page.getByRole('dialog', { name: 'Background color', exact: true });
    await palette.getByLabel('Custom color').fill(color);
    await palette.getByRole('button', { name: 'Apply', exact: true }).click();
  };
  await cell('B row 2').fill('=CONCAT("Keep", " me")');
  await cell('B row 2').press('Enter');
  await cell('C row 2').fill('Keep this too');
  await setBackground('A row 1', '#c33442');
  await setBackground('B row 1', '#3355ee');
  await cell('C row 1').click();
  await table.getByRole('button', { name: 'Bold', exact: true }).click();
  await cell('B row 3').click();
  await table.getByRole('button', { name: 'Italic', exact: true }).click();

  await table.getByRole('button', { name: 'Select row 1', exact: true }).click();
  await page.keyboard.press('Alt+Meta+c');
  await table.getByRole('button', { name: 'Select row 2', exact: true }).click();
  await page.keyboard.press('Alt+Meta+v');
  await expect(background('A row 2')).toHaveCSS('background-color', 'rgb(195, 52, 66)');
  await expect(background('B row 2')).toHaveCSS('background-color', 'rgb(51, 85, 238)');
  await expect(cell('C row 2')).toHaveCSS('font-weight', '700');
  await expect(cell('B row 2')).toHaveValue('Keep me');
  await expect(cell('C row 2')).toHaveValue('Keep this too');

  await columnHeader(table, 'A').click();
  await table.getByRole('button', { name: 'Copy column styles', exact: true }).click();
  await columnHeader(table, 'B').click();
  await table.getByRole('button', { name: 'Paste column styles', exact: true }).click();
  await expect(background('B row 1')).toHaveCSS('background-color', 'rgb(195, 52, 66)');
  await expect(background('B row 2')).toHaveCSS('background-color', 'rgb(195, 52, 66)');
  await expect(cell('B row 3')).toHaveCSS('font-style', 'normal');
  await expect(cell('B row 2')).toHaveValue('Keep me');
});

test('selects all cells in a row or column from its header and opens settings on double-click', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Header selection');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Paste data', exact: true }).first().click();
  const paste = page.getByRole('dialog', { name: 'Paste data', exact: true });
  const rows = Array.from({ length: 61 }, (_, index) => (index + 1) + '\tkeep ' + (index + 1));
  await paste.getByRole('textbox', { name: 'Cell range' }).fill('A\tB\n' + rows.join('\n'));
  await paste.getByRole('button', { name: 'Create table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Pasted data', exact: true });
  const settings = page.getByRole('dialog', { name: 'Column settings', exact: true });
  const firstRow = dialog.getByRole('button', { name: 'Select row 1', exact: true });
  const firstColumn = columnHeader(dialog, 'A');
  const selectedCells = dialog.locator('td.range-cell');

  await firstRow.click();
  await expect(firstRow).toHaveAttribute('aria-pressed', 'true');
  await expect(selectedCells).toHaveCount(2);
  expect(await selectedCells.evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell, '::after').borderWidth)))
    .toEqual(['1px 0px 1px 1px', '1px 1px 1px 0px']);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(rows[0]);
  const thirdRow = dialog.getByRole('button', { name: 'Select row 3', exact: true });
  await thirdRow.click({ modifiers: ['Shift'] });
  await expect(firstRow).toHaveAttribute('aria-pressed', 'true');
  await expect(thirdRow).toHaveAttribute('aria-pressed', 'true');
  await expect(selectedCells).toHaveCount(6);
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(rows.slice(0, 3).join('\n'));

  await firstColumn.click();
  await expect(firstRow).toHaveAttribute('aria-pressed', 'false');
  await expect(firstColumn).toHaveAttribute('aria-pressed', 'true');
  await expect(selectedCells).toHaveCount(60);
  await expect(settings).toHaveCount(0);
  await firstColumn.dblclick();
  const name = settings.getByRole('textbox', { name: 'Name', exact: true });
  await expect(name).toBeFocused();
  await name.fill('Discarded');
  await name.press('Escape');
  await expect(firstColumn).toBeFocused();
  await expect(firstColumn).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Delete');
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('\n'.repeat(60));

  await dialog.getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'A row 61', exact: true })).toHaveValue('');
  await expect(dialog.getByRole('textbox', { name: 'B row 61', exact: true })).toHaveValue('keep 61');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(dialog.getByRole('textbox', { name: 'A row 61', exact: true })).toHaveValue('61');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Fit canvas', exact: true }).click();
  await waitForCanvasFit(page);
  const card = canvasBlock(page, 'Pasted data');
  await card.getByRole('button', { name: 'Select row 1', exact: true }).click();
  await expect(card.locator('td.range-cell')).toHaveCount(2);
  await page.keyboard.press('Backspace');
  await expect(card.getByRole('textbox', { name: 'A row 1', exact: true })).toHaveValue('');
  await expect(card.getByRole('textbox', { name: 'B row 1', exact: true })).toHaveValue('');
  await expect(card.getByRole('textbox', { name: 'B row 2', exact: true })).toHaveValue('keep 2');
});

test('fills series in both directions and shifts relative rows when filling or copying formulas', async ({ page }) => {
  await page.goto('/');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  const cell = (name: string) => dialog.getByRole('textbox', { name, exact: true });
  const select = (name: string) => cell(name).locator('xpath=ancestor::td');
  const dragTo = async (from: Locator, to: Locator) => {
    const start = (await from.boundingBox())!;
    const end = (await to.boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 });
    await page.mouse.up();
  };

  await cell('A row 1').fill('1');
  await cell('B row 1').fill('2026-11-01');
  await cell('A row 2').fill('2');
  await cell('B row 2').fill('2026-11-03');
  await cell('B row 2').press('Enter');
  await dragTo(cell('A row 1'), cell('B row 2'));
  await dragResize(page, dialog.getByRole('button', { name: 'Fill down', exact: true }), 0, 100);
  await expect(cell('A row 4')).toHaveValue('4');
  await expect(cell('B row 4')).toHaveValue('2026-11-07');

  await cell('A row 3').fill('9');
  await cell('B row 3').fill('2026-11-10');
  await cell('A row 4').fill('12');
  await cell('B row 4').fill('2026-11-13');
  await cell('B row 4').press('Enter');
  await dragTo(cell('A row 3'), cell('B row 4'));
  await dragTo(dialog.getByRole('button', { name: 'Fill up', exact: true }), cell('A row 1'));
  await expect(cell('A row 1')).toHaveValue('3');
  await expect(cell('B row 1')).toHaveValue('2026-11-04');

  await cell('B row 2').fill('=A1+A$1');
  await cell('B row 2').press('Enter');
  await select('B row 2').focus();
  await page.keyboard.press('ControlOrMeta+c');
  await select('B row 3').focus();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(cell('B row 3')).toHaveAttribute('title', '=A2+A$1');
  await expect(cell('B row 3')).toHaveValue('9');
  await dragTo(dialog.getByRole('button', { name: 'Fill down', exact: true }), cell('B row 4'));
  await expect(cell('B row 4')).toHaveAttribute('title', '=A3+A$1');
  await expect(cell('B row 4')).toHaveValue('12');
  await select('B row 4').focus();
  await dragTo(dialog.getByRole('button', { name: 'Fill up', exact: true }), cell('B row 2'));
  await expect(cell('B row 2')).toHaveAttribute('title', '=A1+A$1');
});

test('offers cell, row and column actions through the table context menu', async ({ page }) => {
  await page.goto('/');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  const cell = (name: string) => dialog.getByRole('textbox', { name, exact: true });
  const menu = dialog.getByRole('menu', { name: 'Table actions' });
  const action = (name: string) => menu.getByRole('menuitem', { name, exact: true });
  await cell('A row 1').fill('Seed');
  await cell('A row 2').fill('Second');
  await cell('A row 2').press('Enter');
  await cell('A row 1').click({ button: 'right' });
  await action('Copy').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Seed');
  await cell('B row 2').click({ button: 'right' });
  await action('Paste').click();
  await expect(cell('B row 2')).toHaveValue('Seed');
  await cell('A row 1').fill('1');
  await cell('A row 2').fill('2');
  await cell('B row 1').fill('=A1+1');
  await cell('B row 1').press('Enter');
  await cell('B row 1').click({ button: 'right' });
  await action('Copy').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('=A1+1');
  await cell('B row 2').click({ button: 'right' });
  await action('Paste').click();
  await expect(cell('B row 2')).toHaveAttribute('title', '=A2+1');

  await columnHeader(dialog, 'B').click({ button: 'right' });
  await expect(action('Fit column width')).toBeVisible();
  await action('Column settings…').click();
  const settings = page.getByRole('dialog', { name: 'Column settings' });
  await expect(settings.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('B');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();

  const firstRow = dialog.getByRole('button', { name: 'Select row 1', exact: true });
  const secondRow = dialog.getByRole('button', { name: 'Select row 2', exact: true });
  await firstRow.click();
  await secondRow.click({ modifiers: ['Shift'] });
  await secondRow.click({ button: 'right' });
  await expect(action('Delete rows')).toBeVisible();
  await action('Clear contents').click();
  await expect(cell('A row 1')).toHaveValue('');
  await expect(cell('B row 2')).toHaveValue('');
  await expect(menu).toHaveCount(0);
});

test('drags, copies and clears rectangular cell ranges in both table editors', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Drag selection');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  await dialog.getByRole('button', { name: 'Row', exact: true }).click();
  await dialog.getByRole('button', { name: 'Column', exact: true }).click();
  const cell = (editor: Locator, name: string) => editor.getByRole('textbox', { name, exact: true });
  const anchor = cell(dialog, 'B row 2');
  await anchor.fill('One');
  await dialog.getByRole('button', { name: 'Bold', exact: true }).click();
  const formula = '=CONCAT("T", "wo")';
  for (const [name, value] of [['A row 1', 'Keep'], ['C row 2', formula], ['B row 3', 'Three'], ['C row 3', 'Four']]) {
    await cell(dialog, name).fill(value);
  }
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

  const moveTo = async (target: Locator) => {
    const bounds = (await target.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  };
  await anchor.click();
  await moveTo(anchor);
  await page.mouse.down();
  await moveTo(cell(dialog, 'A row 1'));
  await expect(dialog.getByText('A1:B2', { exact: true })).toBeVisible();
  await moveTo(cell(dialog, 'C row 3'));
  await page.mouse.up();
  await expect(dialog.getByText('B2:C3', { exact: true })).toBeVisible();
  await expect(dialog.locator('td.range-cell')).toHaveCount(4);
  expect(await dialog.locator('td.range-cell').evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell, '::after').borderWidth)))
    .toEqual(['1px 0px 0px 1px', '1px 1px 0px 0px', '0px 0px 1px 1px', '0px 1px 1px 0px']);
  await expect(anchor.locator('xpath=ancestor::td')).toBeFocused();
  await expect(anchor.locator('xpath=ancestor::td')).toHaveCSS('box-shadow', 'none');
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('One\t"=CONCAT(""T"", ""wo"")"\nThree\tFour');
  await page.keyboard.press('Delete');
  for (const name of ['B row 2', 'C row 2', 'B row 3', 'C row 3']) {
    await expect(cell(dialog, name)).toHaveValue('');
  }
  await expect(cell(dialog, 'A row 1')).toHaveValue('Keep');
  await expect(anchor).toHaveCSS('font-weight', '700');
  await expect(dialog.locator('td.range-cell')).toHaveCount(4);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(anchor).toHaveValue('One');
  await expect(cell(dialog, 'C row 2')).toHaveValue('Two');
  await expect(cell(dialog, 'C row 3')).toHaveValue('Four');

  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Fit canvas', exact: true }).click();
  await waitForCanvasFit(page);
  const card = canvasBlock(page, 'Untitled table');
  const canvasAnchor = cell(card, 'B row 2');
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  await cell(card, 'A row 1').hover();
  await canvasAnchor.hover();
  await moveTo(canvasAnchor);
  await page.mouse.down();
  await expect(inspector.getByText('B2', { exact: true })).toBeVisible();
  await moveTo(cell(card, 'A row 1'));
  await page.mouse.up();
  await expect(inspector.getByText('A1:B2', { exact: true })).toBeVisible();
  await expect(card.locator('td.range-cell')).toHaveCount(4);
  await expect(canvasAnchor.locator('xpath=ancestor::td')).toBeFocused();
  await page.keyboard.press('Backspace');
  await expect(canvasAnchor).toHaveValue('');
  await expect(cell(card, 'A row 1')).toHaveValue('');
  const outsideRange = cell(card, 'C row 2');
  await expect(outsideRange).toHaveValue('Two');
  await outsideRange.click();
  await expect(outsideRange).not.toBeFocused();
  await page.keyboard.press('Delete');
  await expect(outsideRange).toHaveValue('');
  await expect(cell(card, 'B row 3')).toHaveValue('Three');
  await expect(card).toBeVisible();
});

test('selects complete cells before editing and keeps a confirmed color on its original cell', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Selection mode');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  const source = dialog.getByRole('textbox', { name: 'A row 1', exact: true });
  const destination = dialog.getByRole('textbox', { name: 'B row 1', exact: true });
  const sourceCell = source.locator('xpath=ancestor::td');
  const destinationCell = destination.locator('xpath=ancestor::td');
  await source.click();
  await expect(sourceCell).toBeFocused();
  await expect(source).not.toBeFocused();
  await source.click();
  await expect(source).toBeFocused();
  const value = '=CONCAT("One", " cell")';
  await source.fill(value);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(sourceCell).toBeFocused();
  await expect(source).toHaveValue('');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(source).toHaveValue('One cell');

  await dialog.getByRole('button', { name: 'Background color', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Background color', exact: true });
  await expect(picker.getByRole('group', { name: 'Color palette' }).getByRole('button')).toHaveCount(40);
  await picker.getByRole('button', { name: 'Blue 3', exact: true }).click();
  await expect(sourceCell).not.toHaveCSS('background-color', 'rgb(59, 130, 246)');
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(sourceCell).not.toHaveCSS('background-color', 'rgb(59, 130, 246)');
  await dialog.getByRole('button', { name: 'Background color', exact: true }).click();
  await picker.getByRole('button', { name: 'Blue 3', exact: true }).click();
  await picker.getByRole('button', { name: 'Apply', exact: true }).click();
  await destination.click();
  await expect(destinationCell).toBeFocused();
  await expect(sourceCell).toHaveCSS('background-color', 'rgb(59, 130, 246)');
  await expect(destinationCell).not.toHaveCSS('background-color', 'rgb(59, 130, 246)');

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await source.click();
  await page.keyboard.press('ControlOrMeta+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(value);
  await destination.click();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(destination).toHaveValue('One cell');
  await expect(destinationCell).toHaveCSS('background-color', 'rgb(59, 130, 246)');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(destination).toHaveValue('');
  await expect(destinationCell).not.toHaveCSS('background-color', 'rgb(59, 130, 246)');
});

test('wraps unbroken text, grows with its columns and rows, and limits outer resizing to the content', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New workspace', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Table fit');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const table = canvasBlock(page, 'Untitled table');
  const editor = table.getByRole('textbox', { name: 'A row 1', exact: true });
  const naturalHeight = await editor.evaluate((element: HTMLElement) => element.offsetHeight);
  const text = 'DataFlow'.repeat(8);
  await editor.fill(text);
  await editor.press('Enter');
  await expect(editor).toHaveValue(text);
  await expect(editor).toHaveCSS('overflow', 'hidden');
  await expect.poll(() => editor.evaluate((element: HTMLElement) => element.clientHeight)).toBeGreaterThan(naturalHeight);
  await expect.poll(() => editor.evaluate((element: HTMLElement) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);

  const initial = await cardSize(table);
  const column = table.getByRole('button', { name: 'Resize column B', exact: true });
  const columnWidth = (name: string) => table.getByRole('columnheader', { name, exact: true })
    .evaluate((header: HTMLElement) => header.offsetWidth);
  const leftWidth = await columnWidth('A');
  const rightWidth = await columnWidth('B');
  await column.hover();
  const grid = table.locator('.editor-grid');
  const separator = (await column.boundingBox())!;
  const x = separator.x + separator.width / 2;
  const y = separator.y + separator.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 95, y, { steps: 8 });
  await expect.poll(async () => (await cardSize(table)).width).toBeGreaterThan(initial.width);
  await expect.poll(() => columnWidth('B')).toBeGreaterThan(rightWidth);
  expect(await columnWidth('A')).toBe(leftWidth);
  await expect.poll(() => grid.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await page.mouse.move(x, y, { steps: 8 });
  await expect.poll(() => cardSize(table)).toEqual(initial);
  await page.mouse.move(x + 95, y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await cardSize(table)).width).toBeGreaterThan(initial.width);
  const width = (await cardSize(table)).width;
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => cardSize(table)).toEqual(initial);
  await expect.poll(() => columnWidth('B')).toBe(rightWidth);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(async () => (await cardSize(table)).width).toBe(width);
  await dragResize(page, column, -35, 0);
  await expect.poll(async () => (await cardSize(table)).width).toBeLessThan(width);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await cardSize(table)).width).toBe(width);
  const leftColumn = table.getByRole('button', { name: 'Resize column A', exact: true });
  await dragResize(page, leftColumn, 60, 0);
  const wider = await cardSize(table);
  const leftSeparator = (await leftColumn.boundingBox())!;
  const leftX = leftSeparator.x + leftSeparator.width / 2;
  const leftY = leftSeparator.y + leftSeparator.height / 2;
  await page.mouse.move(leftX, leftY);
  await page.mouse.down();
  await page.mouse.move(leftX - 45, leftY, { steps: 8 });
  await expect.poll(async () => (await cardSize(table)).width).toBeLessThan(wider.width);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => cardSize(table)).toEqual(wider);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await cardSize(table)).width).toBe(width);
  const right = table.locator('.block-resize-edge.right');
  await page.getByRole('button', { name: 'Fit canvas', exact: true }).click();
  await waitForCanvasFit(page);
  await right.hover({ position: { x: 4, y: 35 } });
  await dragResize(page, right, 90, 0, .12);
  await expect.poll(async () => (await cardSize(table)).width).toBe(width);

  const row = table.getByRole('button', { name: 'Resize row 1', exact: true });
  await expect(row).toHaveCSS('height', '13px');
  const height = (await cardSize(table)).height;
  await row.hover();
  await dragResize(page, row, 0, 150);
  await expect.poll(async () => (await cardSize(table)).height).toBeGreaterThan(height);
  await expect.poll(() => table.locator('.node-inline').evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  const fitted = await cardSize(table);
  await dragResize(page, table.locator('.block-resize-corner.bottom.right'), 80, 80);
  await expect.poll(() => cardSize(table)).toEqual(fitted);
});

test('pastes clipboard data directly into a selected cell and infers column types', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const table = page.getByRole('dialog', { name: 'Untitled table' });
  await expect(table.getByRole('textbox', { name: /^[AB] row [12]$/ })).toHaveCount(4);
  await expect(columnHeader(table, 'B')).toContainText('Auto');
  const style = table.getByRole('combobox', { name: 'Style', exact: true });
  await expect(style).toHaveValue('grid');
  await style.selectOption('banded');
  await expect(table.getByRole('button', { name: 'Paste range' })).toHaveCount(0);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('2026-01-01\t42\n2026-01-02\t43'));
  await table.getByRole('textbox', { name: 'A row 1', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(table.getByRole('textbox', { name: 'A row 2', exact: true })).toHaveValue('2026-01-02');
  await expect(table.getByRole('textbox', { name: 'B row 2', exact: true })).toHaveClass(/numeric/);
  await expect(style).toHaveValue('banded');
  await expect(table.getByRole('table').locator('tbody tr')).toHaveCount(2);
});

test('keeps the chart instance while resizing a column in its source table', async ({ page }) => {
  await page.goto('/');
  const chart = canvasBlock(page, 'Spending by month').getByRole('img', { name: 'total chart' }).locator('canvas');
  await expect(chart).toBeVisible();
  await waitForCanvasFit(page);
  await chart.evaluate((canvas: HTMLCanvasElement) => {
    canvas.dataset.contextAcquisitions = '0';
    canvas.getContext = new Proxy(canvas.getContext, {
      apply(target, receiver, args) {
        canvas.dataset.contextAcquisitions = String(Number(canvas.dataset.contextAcquisitions) + 1);
        return Reflect.apply(target, receiver, args);
      },
    });
  });

  const table = canvasBlock(page, 'Transactions');
  const initial = await cardSize(table);
  const separator = table.getByRole('button', { name: 'Resize column Date', exact: true });
  await separator.hover();
  const bounds = (await separator.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y, { steps: 8 });
  await expect.poll(async () => (await cardSize(table)).width).toBeGreaterThan(initial.width);
  await expect(chart).toHaveAttribute('data-context-acquisitions', '0');
  await page.mouse.up();
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await expect(chart).toHaveAttribute('data-context-acquisitions', '0');
});

test('requires an input for a cross-table formula and recalculates it for downstream SQL', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open table', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  const formula = '=MEDIAN(Transactions::Amount)';
  const cell = dialog.getByRole('textbox', { name: 'A row 1', exact: true });
  await cell.fill(formula);
  await cell.press('Enter');
  await expect(dialog.getByRole('status')).toContainText('Connect Transactions as an input');
  await dialog.getByRole('button', { name: 'Done' }).click();

  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  await inspector.getByRole('combobox', { name: 'Connect input' }).selectOption({ label: 'Transactions' });
  const summary = canvasBlock(page, 'Untitled table');
  const output = summary.getByRole('textbox', { name: 'A row 1', exact: true });
  await expect(output).toHaveValue('104.775');
  const edge = page.getByRole('group', { name: 'Connection from Transactions to Untitled table', exact: true });
  await clickConnection(page, edge);
  await expect(edge).toHaveClass(/\bselected\b/);
  await page.keyboard.press('Delete');
  await expect(edge).toHaveCount(0);
  await expect(output).toHaveValue('#ERROR');
  await expect(output).toHaveAttribute('aria-invalid', 'true');
  await expect(summary.getByRole('status')).toContainText('Reconnect the referenced table');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(output).toHaveValue('104.775');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(output).toHaveValue('#ERROR');
  const source = canvasBlock(page, 'Transactions');
  const sourcePort = source.getByRole('button', { name: 'Output port', exact: true });
  await sourcePort.hover();
  const targetPort = (await summary.getByRole('button', { name: 'Input port', exact: true }).boundingBox())!;
  await page.mouse.down();
  await page.mouse.move(targetPort.x + targetPort.width / 2, targetPort.y + targetPort.height / 2, { steps: 14 });
  await page.mouse.up();
  await expect(output).toHaveValue('104.775');
  await expect(output).not.toHaveAttribute('aria-invalid', 'true');

  await source.getByRole('button', { name: 'Open table', exact: true }).click();
  const transactions = page.getByRole('dialog', { name: 'Transactions' });
  await transactions.getByRole('textbox', { name: 'Amount row 1', exact: true }).fill('80');
  await transactions.getByRole('button', { name: 'Done' }).click();
  await expect(output).toHaveValue('84.975');

  await page.getByRole('button', { name: 'Add SQL query', exact: true }).click();
  const query = page.getByRole('dialog', { name: 'Edit SQL' });
  await query.getByRole('combobox', { name: 'Connect input' }).selectOption({ label: 'Untitled table' });
  await query.getByRole('textbox', { name: 'SQL code' }).fill('SELECT "A" FROM untitled_table WHERE "A" IS NOT NULL;');
  await query.getByRole('button', { name: 'Save and run' }).click();
  await expect(inspector.getByRole('cell', { name: '84.975', exact: true })).toBeVisible();
});

test('connects both output handles when dropped onto the body of an existing table', async ({ page }) => {
  await page.goto('/');
  const source = canvasBlock(page, 'Transactions');
  await source.getByRole('button', { name: 'Open table', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  await page.getByRole('dialog', { name: 'Untitled table' }).getByRole('button', { name: 'Done' }).click();

  const target = canvasBlock(page, 'Untitled table');
  const card = target.locator('.graph-card');
  const cell = target.getByRole('textbox', { name: 'B row 1', exact: true });
  await cell.hover({ trial: true });
  const inspector = page.getByRole('complementary', { name: 'Block inspector' });
  const input = inspector.getByRole('button', { name: 'Disconnect Transactions', exact: true });

  async function dropOnCell(handle: Locator) {
    await handle.hover();
    const bounds = (await cell.boundingBox())!;
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 14 });
    await expect(card).toHaveCSS('outline-width', '2px');
    await page.mouse.up();
    await expect(input).toHaveCount(1);
    await expect(card).not.toHaveClass(/accepts-connection/);
    await expect(page.getByRole('group', { name: 'Add connected block' })).toHaveCount(0);
  }

  await source.hover();
  await dropOnCell(source.getByRole('button', { name: 'Connect or add a block from Transactions', exact: true }));
  await input.click();
  await expect(input).toHaveCount(0);
  await dropOnCell(source.getByRole('button', { name: 'Output port', exact: true }));

  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('complementary', { name: 'Workspace blocks' }).getByRole('button', { name: 'Untitled table', exact: true }).click();
  await expect(input).toHaveCount(1);
});
