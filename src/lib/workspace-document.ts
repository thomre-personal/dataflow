import { canConnect, canGroup, isBooleanFunction, newId } from './workspace.ts';
import type { Block, Column, Link, Row, Workspace } from './workspace.ts';
import { cellFonts, cellFontSize } from './cell-style.ts';

const format = 'dataflow-workspace';
const version = 1;
const extension = '.dataflow.json';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function id(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z\d][a-z\d_-]*$/i.test(value) && !Object.hasOwn(Object.prototype, value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalCount(value: unknown, max: number) {
  return value === undefined || (finiteNumber(value) && Number.isInteger(value) && value >= 0 && value <= max);
}

function optionalDimensions(value: unknown) {
  return value === undefined || (record(value)
    && Object.entries(value).every(([key, size]) => id(key) && finiteNumber(size) && size > 0));
}

function cellStyle(value: unknown) {
  if (!record(value)) return false;
  return Object.entries(value).every(([key, field]) => {
    switch (key) {
      case 'color': case 'background': return typeof field === 'string' && /^#[0-9a-f]{6}$/i.test(field);
      case 'fontFamily': return cellFonts.some(({ value }) => value === field);
      case 'fontSize': return finiteNumber(field) && field >= cellFontSize.min && field <= cellFontSize.max;
      case 'bold': case 'italic': case 'underline': case 'strikethrough': return typeof field === 'boolean';
      default: return false;
    }
  });
}

function optionalCellStyles(value: unknown) {
  return value === undefined || (record(value) && Object.entries(value).every(([rowId, styles]) =>
    id(rowId) && record(styles) && Object.entries(styles).every(([columnId, style]) => id(columnId) && cellStyle(style))));
}

function objectsWithIds<T extends { id: string }>(values: unknown, valid: (value: unknown) => value is T): values is T[] {
  return Array.isArray(values) && values.every(valid) && new Set(values.map((value) => value.id)).size === values.length;
}

function column(value: unknown): value is Column {
  return record(value) && id(value.id) && typeof value.name === 'string'
    && ['auto', 'text', 'decimal', 'date', 'boolean'].some((type) => type === value.type);
}

function reference(value: unknown): boolean {
  return record(value) && id(value.columnId) && (value.tableId === undefined || id(value.tableId))
    && ['name', 'letter', 'implicit'].some((kind) => kind === value.reference);
}

function formula(value: unknown, depth = 0): boolean {
  if (!record(value) || depth >= 64) return false;
  if (isBooleanFunction(value.name)) {
    return Array.isArray(value.args) && value.args.length > 0 && (value.name !== 'NOT' || value.args.length === 1)
      && value.args.every((argument) => record(argument) && ('expression' in argument ? formula(argument.expression, depth + 1)
        : 'boolean' in argument ? typeof argument.boolean === 'boolean' : argument.tableId === undefined && reference(argument)));
  }
  switch (value.name) {
    case undefined: return depth === 0 && reference(value);
    case 'SUM': case 'AVERAGE': case 'AVG': case 'MIN': case 'MAX': case 'MEDIAN':
      return reference(value.source);
    case 'COUNT':
      return reference(value.source) && (value.distinct === undefined || typeof value.distinct === 'boolean');
    case 'COUNTIF':
      return reference(value.condition) && typeof value.criterion === 'string';
    case 'SUMIF':
      return reference(value.condition) && typeof value.criterion === 'string'
        && (value.source === undefined || reference(value.source));
    case 'CONCAT':
      return Array.isArray(value.parts) && value.parts.length > 0 && value.parts.every((part) =>
        record(part) && ('expression' in part ? formula(part.expression, depth + 1)
          : 'literal' in part ? typeof part.literal === 'string' : reference(part)));
    default: return false;
  }
}

function row(value: unknown): value is Row {
  return record(value) && id(value.id) && Array.isArray(value.cells) && value.cells.every((cell) => typeof cell === 'string')
    && (value.formulas === undefined || (record(value.formulas)
      && Object.entries(value.formulas).every(([key, entry]) => id(key) && formula(entry))));
}

function block(value: unknown): value is Block {
  if (!record(value) || !id(value.id) || typeof value.title !== 'string'
    || !record(value.position) || !finiteNumber(value.position.x) || !finiteNumber(value.position.y)
    || (value.parentId !== undefined && !id(value.parentId))) return false;
  if (value.kind === 'sql') return typeof value.sql === 'string';
  if (value.expanded !== undefined && typeof value.expanded !== 'boolean') return false;
  if (value.expandedSize !== undefined && (!record(value.expandedSize)
    || !finiteNumber(value.expandedSize.width) || value.expandedSize.width <= 0
    || !finiteNumber(value.expandedSize.height) || value.expandedSize.height <= 0)) return false;
  switch (value.kind) {
    case 'group': return true;
    case 'chart': return (value.chart === 'bar' || value.chart === 'line')
      && typeof value.x === 'string' && typeof value.y === 'string';
    case 'table': {
      const { columns, rows } = value;
      return objectsWithIds(columns, column) && columns.length > 0
        && objectsWithIds(rows, row) && rows.every((row) => row.cells.length === columns.length)
        && ['auto', 'decimal-comma', 'decimal-point'].some((format) => format === value.numberFormat)
        && ['plain', 'banded', 'emphasis', 'grid'].some((style) => style === value.style)
        && (value.rowIndexBase === undefined || value.rowIndexBase === 0 || value.rowIndexBase === 1)
        && (value.inlineLocked === undefined || typeof value.inlineLocked === 'boolean')
        && optionalCount(value.titleColumns, columns.length) && optionalCount(value.footerRows, rows.length)
        && optionalDimensions(value.columnWidths) && optionalDimensions(value.rowHeights) && optionalCellStyles(value.cellStyles);
    }
    default: return false;
  }
}

function link(value: unknown): value is Link {
  return record(value) && id(value.id) && id(value.source) && id(value.target)
    && typeof value.alias === 'string' && /^[a-z][a-z\d_]*$/.test(value.alias);
}

function validGraph(workspace: Workspace) {
  const blocks = new Map(workspace.blocks.map((block) => [block.id, block]));
  for (const item of workspace.blocks) {
    if (item.parentId) {
      const parent = blocks.get(item.parentId);
      if (!parent || !canGroup(item, parent, workspace.blocks)) return false;
    }
  }
  const graph: Workspace = { ...workspace, links: [] };
  for (const item of workspace.links) {
    if (!canConnect(graph, item.source, item.target)
      || graph.links.some((other) => other.target === item.target
        && (blocks.get(item.target)?.kind === 'chart' || other.alias === item.alias))) return false;
    graph.links.push(item);
  }
  return true;
}

export function parseWorkspaceDocument(text: string, workspaceId: string = newId()): Workspace {
  let document: unknown;
  try { document = JSON.parse(text); }
  catch { throw new Error('This file is not valid JSON.'); }
  if (!record(document) || document.format !== format) throw new Error('Choose a DataFlow workspace file.');
  if (document.version !== version) throw new Error('This DataFlow document version is not supported.');
  const data = document.workspace;
  if (!record(data) || typeof data.title !== 'string' || !data.title.trim()
    || !objectsWithIds(data.blocks, block) || !objectsWithIds(data.links, link)) {
    throw new Error('This file contains invalid workspace data.');
  }
  const workspace: Workspace = { id: workspaceId, title: data.title, blocks: data.blocks, links: data.links };
  if (!validGraph(workspace)) throw new Error('This file contains invalid canvas connections or groups.');
  return workspace;
}

export function serializeWorkspaceDocument({ title, blocks, links }: Workspace): string {
  const document = { format, version, workspace: { title, blocks, links } };
  return JSON.stringify(document, (_key, value: unknown) => record(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))
    : value, 2) + '\n';
}

export function workspaceFilename(title: string) {
  const name = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().replace(/\.+$/, '');
  return (name || 'Workspace') + extension;
}

type PickerOptions = { types: { description: string; accept: Record<string, string[]> }[] };
const pickerOptions: PickerOptions = {
  types: [{ description: 'DataFlow workspace', accept: { 'application/json': [extension, '.json'] } }],
};

const filePickers = globalThis as typeof globalThis & {
  showOpenFilePicker?: (options: PickerOptions) => Promise<WorkspaceFileHandle[]>;
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
};

export type WorkspaceFileHandle = FileSystemFileHandle & {
  queryPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  createWritable(options: { mode: 'exclusive' }): Promise<FileSystemWritableFileStream>;
};

export type WorkspaceFileBinding = { handle: WorkspaceFileHandle; fileHash: string; savedHash: string };

export function supportsWorkspaceFiles() {
  return Boolean(filePickers.showOpenFilePicker && filePickers.showDirectoryPicker);
}

export async function pickWorkspaceFile() {
  return (await filePickers.showOpenFilePicker?.(pickerOptions))?.[0];
}

export function pickWorkspaceFolder() {
  return filePickers.showDirectoryPicker?.({ mode: 'readwrite' });
}

export async function createWorkspaceFile(folder: FileSystemDirectoryHandle, title: string, text: string) {
  const name = workspaceFilename(title).slice(0, -extension.length);
  const create = async () => {
    for (let index = 1; ; index++) {
      const filename = name + (index === 1 ? '' : ' (' + index + ')') + extension;
      try {
        await folder.getFileHandle(filename);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TypeMismatchError') continue;
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
        const handle = await folder.getFileHandle(filename, { create: true }) as WorkspaceFileHandle;
        await writeWorkspaceFile(handle, text, await documentHash(''));
        return handle;
      }
    }
  };
  // Selecting an existing path in a browser save picker can truncate that file.
  return navigator.locks ? navigator.locks.request('dataflow-create-file', create) : create();
}

export async function documentHash(contents: string | ArrayBuffer) {
  const bytes = await crypto.subtle.digest('SHA-256', typeof contents === 'string' ? new TextEncoder().encode(contents) : contents);
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function readWorkspaceFile(handle: WorkspaceFileHandle) {
  const bytes = await (await handle.getFile()).arrayBuffer();
  return { text: new TextDecoder().decode(bytes), hash: await documentHash(bytes) };
}

export class WorkspaceFileChanged extends Error {
  constructor() {
    super('The file changed on disk before it could be saved.');
  }
}

export async function writeWorkspaceFile(handle: WorkspaceFileHandle, text: string, expectedHash: string) {
  const write = async () => {
    const stream = await handle.createWritable({ mode: 'exclusive' });
    try {
      await stream.write(text);
      // The browser keeps the previous contents visible until the stream is closed.
      if ((await readWorkspaceFile(handle)).hash !== expectedHash) throw new WorkspaceFileChanged();
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => {});
      throw error;
    }
  };
  if (navigator.locks) await navigator.locks.request('dataflow-file:' + handle.name, write);
  else await write();
}

export function downloadWorkspaceDocument(workspace: Workspace) {
  const url = URL.createObjectURL(new Blob([serializeWorkspaceDocument(workspace)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = workspaceFilename(workspace.title);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
