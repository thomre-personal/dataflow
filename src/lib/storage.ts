import type { Library } from './workspace';
import { tableInputs } from './workspace';
import { bindTableFormulas } from './formulas';

const storeName = 'workspaces';
let opening: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('dataflow', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return opening;
}

export async function loadLibrary(): Promise<Library | undefined> {
  const db = await database();
  const library = await new Promise<Library | undefined>((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).get('library');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (!library) return;
  return {
    ...library,
    workspaces: library.workspaces.map((workspace) => ({
      ...workspace,
      blocks: workspace.blocks.map((block) => block.kind === 'table' ? bindTableFormulas(block, tableInputs(workspace, block.id)) : block),
    })),
  };
}

export async function saveLibrary(library: Library): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(library, 'library');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
