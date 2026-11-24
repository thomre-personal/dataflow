import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { serializeWorkspaceDocument } from '../../src/lib/workspace-document.ts';
import { starterWorkspace } from '../../src/lib/workspace.ts';

function fileCommand(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function workspaceMenu(page: Page) {
  await fileCommand(page, 'Workspaces').click();
}

async function installFilePickers(page: Page, openName: string) {
  // Use real file handles and disk operations while replacing the desktop pickers.
  await page.addInitScript((name) => {
    Object.defineProperty(FileSystemHandle.prototype, 'queryPermission', {
      configurable: true,
      value: async ({ mode }: { mode: string }) => mode === 'readwrite' && sessionStorage.getItem('test-file-permission') === 'prompt' ? 'prompt' : 'granted',
    });
    Object.defineProperty(FileSystemHandle.prototype, 'requestPermission', {
      configurable: true,
      value: async () => { sessionStorage.setItem('test-file-permission', 'granted'); return 'granted'; },
    });
    Object.assign(window, {
      showDirectoryPicker: () => navigator.storage.getDirectory(),
      showOpenFilePicker: async () => [await (await navigator.storage.getDirectory()).getFileHandle(name)],
    });
  }, openName);
}

function putFile(page: Page, name: string, contents: string) {
  return page.evaluate(async ({ name, contents }) => {
    const file = await (await navigator.storage.getDirectory()).getFileHandle(name, { create: true });
    const stream = await file.createWritable();
    await stream.write(contents);
    await stream.close();
  }, { name, contents });
}

function readFile(page: Page, name: string) {
  return page.evaluate(async (name) => {
    const file = await (await navigator.storage.getDirectory()).getFileHandle(name);
    return (await file.getFile()).text();
  }, name);
}

test('autosaves to a new file, detects an external edit, and keeps the browser draft', async ({ page }) => {
  const filename = 'File Budget (2).dataflow.json';
  await installFilePickers(page, filename);
  await page.goto('/');
  await fileCommand(page, 'New workspace').click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('File Budget');
  await fileCommand(page, 'Create workspace').click();
  await fileCommand(page, 'Add table').click();
  const table = page.getByRole('dialog', { name: 'Untitled table' });
  await table.getByRole('textbox', { name: 'A row 1', exact: true }).fill('Initial value');
  await table.getByRole('button', { name: 'Done' }).click();

  await putFile(page, 'File Budget.dataflow.json', 'Existing file');
  await workspaceMenu(page);
  await fileCommand(page, 'Save as file…').click();
  await expect(page.getByText('Saved to file', { exact: true })).toBeVisible();
  expect(await readFile(page, 'File Budget.dataflow.json')).toBe('Existing file');
  expect(await readFile(page, filename)).toContain('Initial value');

  const cell = page.getByRole('textbox', { name: 'A row 1', exact: true });
  await cell.fill('Autosaved value');
  await cell.press('Enter');
  await expect.poll(() => readFile(page, filename)).toContain('Autosaved value');
  await expect(page.getByText('Saved to file', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Saved to file', { exact: true })).toBeVisible();
  await expect(cell).toHaveValue('Autosaved value');

  const diskVersion = (await readFile(page, filename)).replace('Autosaved value', 'External value');
  await putFile(page, filename, diskVersion);
  await cell.fill('Unsaved browser draft');
  await cell.press('Enter');
  await expect(fileCommand(page, 'File changed')).toBeVisible();
  expect(await readFile(page, filename)).toBe(diskVersion);
  await page.reload();
  await expect(fileCommand(page, 'File changed')).toBeVisible();
  await expect(cell).toHaveValue('Unsaved browser draft');

  await fileCommand(page, 'File changed').click();
  await page.getByRole('dialog', { name: 'File changed on disk' }).getByRole('button', { name: 'Open file version' }).click();
  await expect(cell).toHaveValue('External value');
  await expect(page.getByText('Saved to file', { exact: true })).toBeVisible();
  await workspaceMenu(page);
  await fileCommand(page, 'File Budget (local draft)').click();
  await expect(cell).toHaveValue('Unsaved browser draft');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  expect(await readFile(page, filename)).toBe(diskVersion);
});

test('opens an existing file and resumes autosave after write access is granted', async ({ page }) => {
  const name = 'Shared.dataflow.json';
  await installFilePickers(page, name);
  await page.goto('/');
  const workspace = { ...starterWorkspace(), title: 'Shared budget' };
  await putFile(page, name, serializeWorkspaceDocument(workspace));
  await page.evaluate(() => sessionStorage.setItem('test-file-permission', 'prompt'));
  await workspaceMenu(page);
  await fileCommand(page, 'Open file…').click();
  await expect(fileCommand(page, 'Enable file autosave')).toBeVisible();
  const cell = page.getByRole('textbox', { name: 'Category row 1', exact: true });
  await cell.fill('A local change');
  await cell.press('Enter');
  expect(await readFile(page, name)).not.toContain('A local change');
  await fileCommand(page, 'Enable file autosave').click();
  await fileCommand(page, 'Allow file access').click();
  await expect(page.getByText('Saved to file', { exact: true })).toBeVisible();
  expect(await readFile(page, name)).toContain('A local change');
});

test('imports and exports in a browser without direct file access', async ({ page }) => {
  await page.addInitScript(() => Object.assign(window, { showOpenFilePicker: undefined, showDirectoryPicker: undefined }));
  await page.goto('/');
  await workspaceMenu(page);
  await expect(fileCommand(page, 'Open file…')).toHaveCount(0);
  const input = page.locator('input[type="file"]');
  await input.setInputFiles({
    name: 'Portable.dataflow.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeWorkspaceDocument({ ...starterWorkspace(), title: 'Portable copy' })),
  });
  await expect(fileCommand(page, 'Workspaces')).toHaveText('Portable copy');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await workspaceMenu(page);
  const download = page.waitForEvent('download');
  await fileCommand(page, 'Export a copy').click();
  expect((await download).suggestedFilename()).toBe('Portable copy.dataflow.json');
});
