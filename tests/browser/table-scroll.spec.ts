import { expect, test } from '@playwright/test';

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test('zooms when the horizontal scrollbar alone reduces the visible height', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Untitled table' });
  const footer = dialog.getByRole('spinbutton', { name: 'Footer rows' });
  await footer.fill('1');
  await footer.press('Tab');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  const card = page.getByRole('group', { name: 'Table: Untitled table', exact: true });
  const table = card.getByRole('group', { name: 'Edit Untitled table', exact: true });
  await page.addStyleTag({ content: '.graph-card.table .node-inline::-webkit-scrollbar { width: 12px; height: 12px; }' });
  await table.evaluate((element: HTMLElement) => {
    const content = element.querySelector<HTMLElement>('.table-editor-content')!;
    const padding = parseFloat(getComputedStyle(element).paddingTop);
    element.style.width = '260px';
    element.style.height = content.scrollHeight + padding + 'px';
  });
  await expect.poll(() => table.evaluate((element: HTMLElement) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
  await expect.poll(() => table.evaluate((element: HTMLElement) => element.scrollHeight - element.clientHeight)).toBe(12);
  const zoom = page.getByLabel('Canvas zoom');
  await table.hover();
  const before = Number((await zoom.textContent())?.replace('%', ''));
  await page.mouse.wheel(0, 70);
  await expect.poll(async () => Number((await zoom.textContent())?.replace('%', ''))).toBeLessThan(before);
  expect(await table.evaluate((element) => element.scrollTop)).toBe(0);
});
