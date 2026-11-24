import type { Library } from './workspace';
import { bindWorkspaceFormulas } from './formulas';
import type { WorkspaceFileBinding } from './workspace-document';

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
    workspaces: library.workspaces.map(bindWorkspaceFormulas),
  };
}

export async function loadWorkspaceFiles(ids: string[]): Promise<Record<string, WorkspaceFileBinding>> {
  const db = await database();
  const store = db.transaction(storeName).objectStore(storeName);
  const entries = await Promise.all(ids.map((id) => new Promise<[string, WorkspaceFileBinding | undefined]>((resolve, reject) => {
    const request = store.get('file:' + id);
    request.onsuccess = () => resolve([id, request.result]);
    request.onerror = () => reject(request.error);
  })));
  return Object.fromEntries(entries.filter((entry): entry is [string, WorkspaceFileBinding] => entry[1] !== undefined));
}

export async function saveLibrary(library: Library, file?: { id: string; binding: WorkspaceFileBinding }): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
    try {
      store.put(library, 'library');
      if (file) store.put(file.binding, 'file:' + file.id);
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}
