<script lang="ts">
  import { Background, BackgroundVariant, MarkerType, MiniMap, SvelteFlow } from '@xyflow/svelte';
  import type { Connection, Edge, Node, OnConnectEnd, ResizeParams } from '@xyflow/svelte';
  import {
    ArrowDownLeft, ArrowUpRight, Braces, ChartColumnIncreasing, Check,
    ChevronDown, CircleAlert, ClipboardPlus, CloudOff, Download, FileText, Focus, Folder, FolderOpen, Layers3, Link2, Maximize,
    PanelRightClose, PanelRightOpen, Pencil, Play, Plus, Redo2, RefreshCw, Search, Settings as SettingsIcon, SlidersHorizontal, Table2, Trash2, Undo2, Unplug,
    Workflow, X,
  } from 'lucide-svelte';
  import { onMount, tick, untrack } from 'svelte';
  import GraphCard from './components/GraphCard.svelte';
  import type { CardData } from './components/GraphCard.svelte';
  import BlockSearch from './components/BlockSearch.svelte';
  import CanvasControls from './components/CanvasControls.svelte';
  import type { CanvasPosition, FitCanvas } from './components/CanvasControls.svelte';
  import Modal from './components/Modal.svelte';
  import ConfirmDialog from './components/ConfirmDialog.svelte';
  import type { Confirmation } from './components/ConfirmDialog.svelte';
  import ConfigEditor from './components/ConfigEditor.svelte';
  import TableEditor from './components/TableEditor.svelte';
  import CellInspector from './components/CellInspector.svelte';
  import ResultGrid from './components/ResultGrid.svelte';
  import MiniChart from './components/MiniChart.svelte';
  import Settings from './components/Settings.svelte';
  import { absolutePosition, addLink, canConnect, canGroup, columnLetter, createBlock, createWorkspace, dataRowCount, kinds, newId, related, rowNumber, sqlAlias, starterWorkspace, tableInputs } from './lib/workspace';
  import type { Block, BlockKind, ChartBlock, GroupBlock, Library, Link, NumberFormat, Position, Result, SqlBlock, TableBlock, Workspace } from './lib/workspace';
  import { importGrid, parseDelimited } from './lib/clipboard';
  import { bindTableFormulas, bindWorkspaceFormulas, cellFormulaText, isFormulaEntry } from './lib/formulas';
  import { cellSelectionBounds, updateCellStyles } from './lib/cell-style';
  import type { CellSelection, CellStyle, CellTextStyle } from './lib/cell-style';
  import { describeCellIssue, invalidTableCells, tableData } from './lib/table-data';
  import { chartSeries, countLabel, tableResult } from './lib/format';
  import { loadLibrary, loadWorkspaceFiles, saveLibrary } from './lib/storage';
  import {
    createWorkspaceFile, documentHash, downloadWorkspaceDocument, parseWorkspaceDocument, pickWorkspaceFile,
    pickWorkspaceFolder, readWorkspaceFile, serializeWorkspaceDocument, supportsWorkspaceFiles,
    WorkspaceFileChanged, writeWorkspaceFile,
  } from './lib/workspace-document';
  import type { WorkspaceFileBinding, WorkspaceFileHandle } from './lib/workspace-document';
  import { defaultHotkeys, defaultPreferences, eventHotkey, hotkeyLabel, isMac, loadPreferences } from './lib/preferences';
  import type { Preferences } from './lib/preferences';

  const icons = { table: Table2, sql: Braces, chart: ChartColumnIncreasing, config: SlidersHorizontal, group: Folder };
  const blockKinds: BlockKind[] = ['table', 'sql', 'chart', 'config', 'group'];
  const blockDragType = 'application/x-dataflow-block';
  const groupInset = { x: 24, y: 55 };
  const addLabel = (kind: BlockKind) => 'Add ' + (kind === 'sql' ? 'SQL query' : kinds[kind].label.toLowerCase());
  const fitOptions = { padding: '5%' as const, maxZoom: 1.12 };
  const nodeTypes = { block: GraphCard };
  let requestFit: FitCanvas | undefined;
  let canvasPosition: CanvasPosition | undefined;
  const sample = starterWorkspace();
  type HistoryEntry = { workspace: Workspace; selectedId: string };
  let histories = $state<Record<string, { undo: HistoryEntry[]; redo: HistoryEntry[] }>>({});
  let library = $state<Library>({ activeId: sample.id, workspaces: [sample] });
  let workspace = $derived(library.workspaces.find((item) => item.id === library.activeId) ?? library.workspaces[0]);
  let blocksById = $derived(new Map(workspace.blocks.map((block) => [block.id, block])));
  let childrenByParent = $derived.by(() => {
    const children = new Map<string, Block[]>();
    for (const block of workspace.blocks) {
      if (!block.parentId) continue;
      const siblings = children.get(block.parentId);
      if (siblings) siblings.push(block);
      else children.set(block.parentId, [block]);
    }
    return children;
  });
  let history = $derived(histories[workspace.id]);
  let ready = $state(false);
  let selectedId = $state('monthly-totals');
  let selected = $derived(workspace.blocks.find((block) => block.id === selectedId));
  let activeCell = $state<(CellSelection & { tableId: string })>();
  let inspectorScroll = $state<HTMLDivElement>();
  let copiedCellStyle = $state<{ style: CellStyle } | { styles: CellStyle[] }>();
  let canPasteCellStyle = $derived(Boolean(copiedCellStyle && ('style' in copiedCellStyle || activeCell?.axis)));
  let selectedCellBounds = $derived(selected?.kind === 'table' && activeCell?.tableId === selected.id
    ? cellSelectionBounds(selected, activeCell) : undefined);
  let selectedTableCell = $derived.by(() => {
    if (selected?.kind !== 'table' || !selectedCellBounds) return;
    const { row, column, top, bottom, left, right } = selectedCellBounds;
    const letter = columnLetter(column);
    const name = selected.columns[column].name;
    const text = cellFormulaText(selected.rows[row], selected.columns, column, tableInputs(workspace, selected.id));
    const start = columnLetter(left) + rowNumber(selected, top);
    return {
      address: activeCell?.axis === 'row' ? 'Row ' + rowNumber(selected, row)
        : activeCell?.axis === 'column' ? 'Column ' + letter
        : top === bottom && left === right ? start : start + ':' + columnLetter(right) + rowNumber(selected, bottom),
      column: name === letter ? undefined : name,
      formula: isFormulaEntry(text) ? text : '',
      format: selected.cellStyles?.[selected.rows[row].id]?.[selected.columns[column].id] ?? {},
      defaultBold: column < (selected.titleColumns ?? 0) || row >= dataRowCount(selected),
      selectionKey: JSON.stringify([workspace.id, activeCell]),
    };
  });
  $effect(() => {
    if (activeCell && inspectorScroll) inspectorScroll.scrollTop = 0;
  });
  let inputLinks = $derived(workspace.links.filter((link) => link.target === selectedId));
  let outputLinks = $derived(workspace.links.filter((link) => link.source === selectedId));
  let panel = $state(true);
  let filter = $state('');
  let focused = $state('');
  const groupDrop = $state({ target: '' });
  let connectionDrag: { port?: Connection } | undefined;
  let workspaceMenu = $state(false);
  let activeTab = $state<'sql' | 'data'>('sql');
  let modal = $state<'paste' | 'table' | 'sql' | 'chart' | 'config' | 'workspace' | 'workspace-file' | 'settings' | 'quick-create' | 'configure' | null>(null);
  let confirmation = $state.raw<Confirmation>();
  let quickSource = $state('');
  let quickPosition = $state<Position>({ x: 0, y: 0 });
  let quickPointer = $state<Position>({ x: 0, y: 0 });
  let draftBlock = $state<TableBlock | SqlBlock | ChartBlock | undefined>();
  let quickPicker = $state<HTMLDivElement>();
  let sqlDraft = $state('');
  let sqlDraftLinks = $state<Link[]>([]);
  let quickFirstButton = $state<HTMLButtonElement>();
  let workspaceTitle = $state('');
  let renamingWorkspace = $state(false);
  let pasteText = $state('');
  let pasteHeader = $state(true);
  let pasteNumberFormat = $state<NumberFormat>('auto');
  let pasteTarget = $state('');
  let pasteFromTableDialog = $state(false);
  let pasteError = $state('');
  let blockSearch = $state<BlockSearch>();
  let queryViewRevision = 0;
  let saveState = $state<'saving' | 'saved' | 'error'>('saved');
  type FileState = { kind: 'saving' | 'saved' | 'permission' | 'conflict' | 'error'; message?: string };
  let workspaceFiles = $state.raw<Record<string, WorkspaceFileBinding>>({});
  let fileStates = $state<Record<string, FileState>>({});
  let workspaceFile = $derived(workspaceFiles[workspace.id]);
  let fileState = $derived(fileStates[workspace.id]);
  let fileAction = $state(false);
  let fileInput: HTMLInputElement;
  const fileTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let fileWork = Promise.resolve();
  let notice = $state('');
  let preferences = $state<Preferences>(defaultPreferences);
  let systemDark = $state(false);
  let dark = $derived(preferences.theme === 'dark' || (preferences.theme === 'auto' && systemDark));
  let flowNodes = $state.raw<Node<CardData>[]>([]);
  let flowEdges = $state.raw<Edge[]>([]);
  type ComputedState = { state: 'ready' | 'stale' | 'running' | 'error'; result?: Result; error?: string };
  let workspaceResults = $state<Record<string, Record<string, ComputedState>>>({});
  let runtime = $derived(workspaceResults[workspace.id] ?? {});
  let refreshingInBackground = $state(false);
  const stamps = new Map<string, number>();
  const queryKey = (workspaceId: string, blockId: string) => workspaceId + ':' + blockId;
  let saveWork = Promise.resolve();
  let saveSequence = 0;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  function message(text: string) {
    notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice = ''; }, 4200);
  }

  function persist(file?: { id: string; binding: WorkspaceFileBinding }) {
    if (!ready) return;
    const snapshot = $state.snapshot(library) as Library;
    const sequence = ++saveSequence;
    saveState = 'saving';
    saveWork = saveWork.catch(() => {}).then(() => saveLibrary(snapshot, file));
    void saveWork.then(() => {
      if (sequence === saveSequence) saveState = 'saved';
    }, () => {
      if (sequence === saveSequence) saveState = 'error';
    });
    return saveWork;
  }

  function saveWorkspace(next: Workspace) {
    const previous = workspace;
    library = { ...library, workspaces: library.workspaces.map((item) => item.id === next.id ? next : item) };
    invalidateComputed(previous, next);
    persist();
    scheduleFileSave(next.id);
  }

  function queueFileWork<T>(action: () => Promise<T>) {
    const pending = fileWork.then(action);
    fileWork = pending.then(() => {}, () => {});
    return pending;
  }

  function rememberFile(id: string, binding: WorkspaceFileBinding) {
    workspaceFiles = { ...workspaceFiles, [id]: binding };
    return persist({ id, binding });
  }

  function scheduleFileSave(id: string) {
    const status = fileStates[id]?.kind;
    if (!workspaceFiles[id] || status === 'conflict' || status === 'permission' || status === 'error') return;
    fileStates[id] = { kind: 'saving' };
    clearTimeout(fileTimers.get(id));
    fileTimers.set(id, setTimeout(() => void checkFile(id), 350));
  }

  function checkFile(id: string) {
    clearTimeout(fileTimers.get(id));
    fileTimers.delete(id);
    return queueFileWork(async () => {
      const binding = workspaceFiles[id];
      const current = library.workspaces.find((item) => item.id === id);
      if (!binding || !current) return;
      try {
        await saveWork.catch(() => {});
        const { handle } = binding;
        if (await handle.queryPermission({ mode: 'read' }) !== 'granted') {
          fileStates[id] = { kind: 'permission' };
          return;
        }
        const text = serializeWorkspaceDocument(current);
        const savedHash = await documentHash(text);
        const disk = await readWorkspaceFile(handle);
        if (disk.hash !== binding.fileHash && disk.hash !== savedHash) throw new WorkspaceFileChanged();
        if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
          fileStates[id] = { kind: 'permission' };
          return;
        }
        if (disk.hash !== savedHash && savedHash !== binding.savedHash) {
          fileStates[id] = { kind: 'saving' };
          await writeWorkspaceFile(handle, text, disk.hash);
          await rememberFile(id, { handle, fileHash: savedHash, savedHash });
        } else if (disk.hash === savedHash && (binding.fileHash !== disk.hash || binding.savedHash !== savedHash)) {
          await rememberFile(id, { handle, fileHash: disk.hash, savedHash });
        }
        fileStates[id] = { kind: 'saved' };
        if (library.workspaces.find((item) => item.id === id) !== current && !fileTimers.has(id)) scheduleFileSave(id);
      } catch (error) {
        if (error instanceof WorkspaceFileChanged) {
          fileStates[id] = { kind: 'conflict' };
        } else if (error instanceof DOMException && error.name === 'NotAllowedError') {
          fileStates[id] = { kind: 'permission' };
        } else {
          fileStates[id] = { kind: 'error', message: error instanceof Error ? error.message : String(error) };
        }
      }
    });
  }

  async function runFileAction(action: () => Promise<void>) {
    if (fileAction || !ready) return;
    fileAction = true;
    try {
      await action();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        message(error instanceof Error ? error.message : String(error));
      }
    } finally {
      fileAction = false;
    }
  }

  async function linkedWorkspace(handle: WorkspaceFileHandle) {
    for (const [id, binding] of Object.entries(workspaceFiles)) {
      if (await handle.isSameEntry(binding.handle)) return id;
    }
  }

  function openFile() {
    workspaceMenu = false;
    void runFileAction(async () => {
      const handle = await pickWorkspaceFile();
      if (!handle) return;
      const existing = await linkedWorkspace(handle);
      if (existing) {
        await switchWorkspace(existing);
        return;
      }
      const disk = await readWorkspaceFile(handle);
      const current = bindWorkspaceFormulas(parseWorkspaceDocument(disk.text));
      const savedHash = await documentHash(serializeWorkspaceDocument(current));
      library = { ...library, workspaces: [...library.workspaces, current] };
      await switchWorkspace(current.id, { handle, fileHash: disk.hash, savedHash });
    });
  }

  function importFile(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    void runFileAction(async () => {
      const current = bindWorkspaceFormulas(parseWorkspaceDocument(await file.text()));
      library = { ...library, workspaces: [...library.workspaces, current] };
      await switchWorkspace(current.id);
      message('Opened a browser copy');
    });
  }

  function saveAsFile() {
    workspaceMenu = false;
    const id = workspace.id;
    void runFileAction(async () => {
      const folder = await pickWorkspaceFolder();
      if (!folder) return;
      await queueFileWork(async () => {
        const current = library.workspaces.find((item) => item.id === id);
        if (!current) return;
        const text = serializeWorkspaceDocument(current);
        const savedHash = await documentHash(text);
        const handle = await createWorkspaceFile(folder, current.title, text);
        await rememberFile(id, { handle, fileHash: savedHash, savedHash });
        fileStates[id] = { kind: 'saved' };
        if (workspace.id === id && modal === 'workspace-file') closeModal();
        if (library.workspaces.find((item) => item.id === id) !== current) scheduleFileSave(id);
      });
    });
  }

  function enableFileAutosave() {
    const id = workspace.id;
    const binding = workspaceFile;
    if (!binding) return;
    void runFileAction(async () => {
      if (await binding.handle.requestPermission({ mode: 'readwrite' }) !== 'granted') return;
      await checkFile(id);
      if (fileStates[id]?.kind === 'saved' && modal === 'workspace-file') closeModal();
    });
  }

  async function checkCurrentFile() {
    const id = workspace.id;
    workspaceMenu = false;
    if (saveState === 'error') persist();
    await checkFile(id);
    if (workspace.id !== id) return;
    if (fileStates[id]?.kind === 'saved' && saveState !== 'error') {
      if (modal === 'workspace-file') closeModal();
    } else if (!modal) {
      modal = 'workspace-file';
    }
  }

  function openDiskVersion() {
    const id = workspace.id;
    void runFileAction(async () => {
      await queueFileWork(async () => {
        const binding = workspaceFiles[id];
        if (!binding || workspace.id !== id) return;
        const disk = await readWorkspaceFile(binding.handle);
        const current = bindWorkspaceFormulas(parseWorkspaceDocument(disk.text, id));
        const savedHash = await documentHash(serializeWorkspaceDocument(current));
        const draft = workspace;
        const keepDraft = await documentHash(serializeWorkspaceDocument(draft)) !== binding.savedHash;
        if (workspace !== draft) throw new Error('The workspace changed while the file was opening. Try again.');
        const workspaces = library.workspaces.map((item) => item.id === id ? current : item);
        if (keepDraft) workspaces.push({ ...draft, id: newId(), title: draft.title + ' (local draft)', sample: undefined });
        for (const block of draft.blocks) {
          if (block.kind === 'sql') bumpQueryStamp(id, block.id);
        }
        delete workspaceResults[id];
        delete histories[id];
        library = { ...library, workspaces };
        closeModal();
        await switchWorkspace(id, { ...binding, fileHash: disk.hash, savedHash });
        if (keepDraft) message('Your edits were kept as a separate browser workspace');
      });
    });
  }

  function replaceWorkspace(next: Workspace) {
    if (!history) histories[workspace.id] = { undo: [], redo: [] };
    const currentHistory = histories[workspace.id];
    currentHistory.undo.push({ workspace, selectedId });
    currentHistory.redo.length = 0;
    saveWorkspace(next);
  }

  function stepHistory(direction: 'undo' | 'redo') {
    if (!history) return;
    const entry = history[direction].pop();
    if (!entry) return;
    const next = entry.workspace;
    history[direction === 'undo' ? 'redo' : 'undo'].push({ workspace, selectedId });

    saveWorkspace(next);
    if (!next.blocks.some(({ id }) => id === focused)) focused = '';
    if (entry.selectedId !== selectedId) {
      selectedId = entry.selectedId;
      activeCell = undefined;
      showQueryTab('sql');
    }
    initializeComputed(next);
  }

  function bumpQueryStamp(workspaceId: string, blockId: string) {
    const key = queryKey(workspaceId, blockId);
    const stamp = (stamps.get(key) ?? 0) + 1;
    stamps.set(key, stamp);
    return stamp;
  }

  function invalidateComputed(previous: Workspace, next: Workspace) {
    const previousLinks = new Set(previous.links.map(({ id }) => id));
    const nextLinks = new Set(next.links.map(({ id }) => id));
    const changedInputs = new Set([
      ...previous.links.filter(({ id }) => !nextLinks.has(id)).map(({ target }) => target),
      ...next.links.filter(({ id }) => !previousLinks.has(id)).map(({ target }) => target),
    ]);
    const changed = new Set(changedInputs);
    const nextBlocks = new Map(next.blocks.map((block) => [block.id, block]));
    workspaceResults[next.id] ??= {};
    const results = workspaceResults[next.id];
    for (const before of previous.blocks) {
      const block = nextBlocks.get(before.id);
      if (!block) {
        if (before.kind === 'sql') bumpQueryStamp(next.id, before.id);
        delete results[before.id];
      } else if ((block.kind === 'sql' && before.kind === 'sql' && block.sql !== before.sql)
        || (block.kind === 'config' && before.kind === 'config' && block.fields !== before.fields)
        || (block.kind === 'table' && before.kind === 'table'
          && (block.rows !== before.rows || block.columns !== before.columns || block.numberFormat !== before.numberFormat
            || block.footerRows !== before.footerRows))) {
        changed.add(block.id);
      }
    }

    for (const id of [...changed, ...related(next, changed, 'outputs')]) {
      const block = nextBlocks.get(id);
      if (block?.kind === 'sql') {
        bumpQueryStamp(next.id, id);
        results[id] = { state: 'stale', result: results[id]?.result };
      } else if (block?.kind === 'chart') {
        const source = chartSource(block, next);
        if (source?.kind !== 'table') delete results[id];
        else if (changedInputs.has(id) || !results[id]) evaluateTableChart(block, source, next);
        else results[id] = { state: 'stale', result: results[id].result };
      }
    }
  }

  function patchBlock(id: string, patch: Partial<Block>) {
    if (!workspace.blocks.some((block) => block.id === id)) return;
    replaceWorkspace({ ...workspace, blocks: workspace.blocks.map((block) => block.id === id ? { ...block, ...patch } as Block : block) });
  }

  function renameBlock(id: string, value: string) {
    const block = workspace.blocks.find((item) => item.id === id);
    const title = value.trim();
    if (block && title && title !== block.title) patchBlock(id, { title });
    return title || block?.title || '';
  }

  async function runSQL(block: SqlBlock, showResult = true) {
    const source = $state.snapshot(workspace) as Workspace;
    const key = queryKey(source.id, block.id);
    workspaceResults[source.id] ??= {};
    const queries = workspaceResults[source.id];
    if (queries[block.id]?.state === 'running') return;
    const stamp = bumpQueryStamp(source.id, block.id);
    const viewRevision = queryViewRevision;
    queries[block.id] = { state: 'running', result: queries[block.id]?.result };
    try {
      const { runQuery } = await import('./lib/sql');
      if (stamps.get(key) !== stamp) return;
      const result = await runQuery(source, block.id);
      if (stamps.get(key) !== stamp) return;
      queries[block.id] = { state: 'ready', result };
      if (showResult && viewRevision === queryViewRevision && selectedId === block.id && library.activeId === source.id) activeTab = 'data';
    } catch (error) {
      if (stamps.get(key) !== stamp) return;
      queries[block.id] = { state: 'error', result: queries[block.id]?.result, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function initializeComputed(current: Workspace) {
    for (const block of current.blocks) {
      if (runtime[block.id]) continue;
      if (block.kind === 'sql') void runSQL(block, false);
      if (block.kind === 'chart') {
        const chartInput = chartSource(block, current);
        if (chartInput?.kind === 'table') evaluateTableChart(block, chartInput, current);
      }
    }
  }

  onMount(() => {
    const preference = matchMedia('(prefers-color-scheme: dark)');
    systemDark = preference.matches;
    const changed = (event: MediaQueryListEvent) => { systemDark = event.matches; };
    preference.addEventListener('change', changed);
    preferences = loadPreferences();
    void (async () => {
      try {
        const restored = await loadLibrary();
        if (restored?.workspaces.length) {
          library = restored;
          selectedId = workspace.blocks.find((block) => block.kind === 'sql')?.id ?? workspace.blocks[0]?.id ?? '';
          workspaceFiles = await loadWorkspaceFiles(restored.workspaces.map((item) => item.id));
        }
        ready = true;
        if (!restored) persist();
      } catch {
        ready = true;
        saveState = 'error';
      }
      initializeComputed(workspace);
      if (workspaceFile) void checkFile(workspace.id);
    })();
    return () => {
      preference.removeEventListener('change', changed);
      clearTimeout(noticeTimer);
      for (const timer of fileTimers.values()) clearTimeout(timer);
    };
  });

  $effect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (ready) {
      try { localStorage.setItem('dataflow-preferences', JSON.stringify(preferences)); } catch { /* Keep this tab usable without browser storage. */ }
    }
  });

  function chartSource(block: ChartBlock, current = workspace) {
    const sourceId = current.links.find((item) => item.target === block.id)?.source;
    return current.blocks.find((item) => item.id === sourceId);
  }

  function evaluateTableChart(block: ChartBlock, source: TableBlock, current: Workspace) {
    workspaceResults[current.id] ??= {};
    const results = workspaceResults[current.id];
    try {
      results[block.id] = { result: tableResult(source, current), state: 'ready' };
    } catch (error) {
      results[block.id] = { state: 'error', result: results[block.id]?.result, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function chartInput(block: ChartBlock): Partial<ComputedState> {
    const source = chartSource(block);
    return runtime[source?.kind === 'sql' ? source.id : block.id] ?? {};
  }

  function refreshChart(block: ChartBlock) {
    const source = chartSource(block);
    if (source?.kind === 'table') evaluateTableChart(block, source, workspace);
    if (source?.kind === 'sql') void runSQL(source, false);
  }

  $effect(() => {
    if (!ready || !preferences.autoRefreshComputed || refreshingInBackground
      || !workspace.blocks.some(({ id }) => runtime[id]?.state === 'stale')) return;
    // Coalesce edits before taking a snapshot for the SQL engine.
    const timer = setTimeout(() => {
      for (const block of workspace.blocks) {
        if (block.kind === 'chart' && runtime[block.id]?.state === 'stale') refreshChart(block);
      }
      const query = workspace.blocks.find((block): block is SqlBlock => block.kind === 'sql' && runtime[block.id]?.state === 'stale');
      if (query) {
        refreshingInBackground = true;
        void runSQL(query, false).finally(() => { refreshingInBackground = false; });
      }
    }, 180);
    return () => clearTimeout(timer);
  });

  function tableProblem(block: Block) {
    if (block.kind !== 'table') return undefined;
    const issue = invalidTableCells(block, tableData(block, workspace)).next().value;
    return issue ? describeCellIssue(block, issue) : undefined;
  }

  function nodeSize(block: Block, focusScope?: ReadonlySet<string>): { width: number; height: number } {
    if ((block.kind === 'table' || block.kind === 'chart' || block.kind === 'config') && block.expanded !== false) {
      if (block.expandedSize) return block.expandedSize;
      if (block.kind === 'chart') return { width: 420, height: 320 };
      if (block.kind === 'config') return { width: 300, height: 260 };
      return { width: 320, height: Math.max(280, 132 + Math.min(block.rows.length, 13) * 28) };
    }
    if (block.kind !== 'group') return { width: 260, height: 228 };
    if (block.expanded === false && !focusScope?.has(block.id)) return { width: 260, height: 66 };
    const children = childrenByParent.get(block.id) ?? [];
    return children.reduce((size, child) => {
      const bounds = nodeSize(child, focusScope);
      return { width: Math.max(size.width, child.position.x + bounds.width + 24), height: Math.max(size.height, child.position.y + bounds.height + 24) };
    }, block.expandedSize ?? { width: 330, height: 280 });
  }

  function resizeBlock(id: string, { x, y, width, height }: ResizeParams) {
    const block = blocksById.get(id);
    if (!block) return;
    const expandedSize = { width, height };
    if (block.kind !== 'group' || focused) {
      patchBlock(id, focused ? { expandedSize } : { expandedSize, position: { x, y } });
      return;
    }
    const dx = x - block.position.x;
    const dy = y - block.position.y;
    replaceWorkspace({ ...workspace, blocks: workspace.blocks.map((item) => {
      if (item.id === id) return { ...block, expandedSize, position: { x, y } };
      if (item.parentId !== id || (!dx && !dy)) return item;
      return { ...item, position: { x: item.position.x - dx, y: item.position.y - dy } };
    }) });
  }

  function groupCanResize(group: GroupBlock, { x, y, width, height }: ResizeParams) {
    if (focused) return true;
    return (childrenByParent.get(group.id) ?? []).every((child) => {
      const left = child.position.x + group.position.x - x;
      const top = child.position.y + group.position.y - y;
      const size = nodeSize(child);
      return left >= Math.min(groupInset.x, child.position.x) && top >= Math.min(groupInset.y, child.position.y)
        && left + size.width + 24 <= width && top + size.height + 24 <= height;
    });
  }

  function focusScope(center: Block) {
    const members = new Set([center.id]);
    for (const id of members) {
      for (const child of childrenByParent.get(id) ?? []) members.add(child.id);
    }
    return members;
  }

  function toggleExpanded(block: Exclude<Block, SqlBlock>) {
    const expanded = block.expanded === false;
    patchBlock(block.id, { expanded });
    if (block.kind === 'group' && !expanded && visibleBlockId(selectedId) === block.id) select(block.id);
  }

  function depth(block: Block) {
    let count = 0;
    let parent = blocksById.get(block.parentId ?? '');
    const visited = new Set([block.id]);
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      count++;
      parent = blocksById.get(parent.parentId ?? '');
    }
    return count;
  }

  function visibleBlockId(id: string) {
    let visible = id;
    let parent = blocksById.get(blocksById.get(id)?.parentId ?? '');
    const visited = new Set([id]);
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id);
      if (parent.kind === 'group' && parent.expanded === false) visible = parent.id;
      parent = blocksById.get(parent.parentId ?? '');
    }
    return visible;
  }

  $effect(() => {
    const center = blocksById.get(focused);
    const members = center ? focusScope(center) : new Set<string>();
    const inputs = related(workspace, members, 'inputs');
    const outputs = related(workspace, members, 'outputs');
    for (const id of inputs) outputs.delete(id);
    const focusPositions = new Map<string, { x: number; y: number }>();
    if (center) {
      focusPositions.set(center.id, { x: 0, y: 0 });
      for (const id of members) {
        if (id !== center.id) focusPositions.set(id, { ...blocksById.get(id)!.position });
      }
      const centerSize = nodeSize(center, members);
      for (const [direction, ids] of [['input', inputs], ['output', outputs]] as const) {
        const side = workspace.blocks.filter((block) => ids.has(block.id)).map((block) => ({ id: block.id, ...nodeSize(block) }));
        const height = side.reduce((sum, block) => sum + block.height + 32, -32);
        let y = (centerSize.height - height) / 2;
        for (const block of side) {
          focusPositions.set(block.id, { x: direction === 'input' ? -90 - block.width : centerSize.width + 90, y });
          y += block.height + 32;
        }
      }
    }
    const visibleLinks = workspace.links.flatMap((link) => {
      if (center) return focusPositions.has(link.source) && focusPositions.has(link.target) ? [link] : [];
      const source = visibleBlockId(link.source);
      const target = visibleBlockId(link.target);
      return source === target ? [] : [{ ...link, source, target }];
    });
    flowNodes = workspace.blocks.filter((block) => center ? focusPositions.has(block.id) : visibleBlockId(block.id) === block.id)
      .sort((a, b) => depth(a) - depth(b)).map((block) => {
      const result = block.kind === 'chart' ? chartInput(block) : runtime[block.id] ?? {};
      const size = nodeSize(block, members);
      const expandable = block.kind !== 'sql';
      const parentId = !center || (block.id !== center.id && members.has(block.id)) ? block.parentId : undefined;
      return {
        id: block.id, type: 'block', position: focusPositions.get(block.id) ?? { ...block.position }, parentId,
        selected: block.id === selectedId,
        dragHandle: block.kind === 'group' ? '.group-card' : '.node-heading',
        ...size,
        zIndex: block.kind === 'group' ? depth(block) : 10 + depth(block),
        ariaLabel: kinds[block.kind].label + ': ' + block.title,
        data: {
          block, result: result.result, dataState: result.state, dark,
          issue: block.kind === 'table' ? tableProblem(block) : result.error,
          focusSide: inputs.has(block.id) ? 'input' : outputs.has(block.id) ? 'output' : undefined,
          open: () => openBlock(block.id),
          rename: (title: string) => renameBlock(block.id, title),
          toggleExpanded: expandable ? () => toggleExpanded(block) : undefined,
          resize: expandable ? (bounds: ResizeParams) => resizeBlock(block.id, bounds) : undefined,
          canResize: block.kind === 'group' ? (bounds: ResizeParams) => groupCanResize(block, bounds) : undefined,
          config: block.kind === 'config' ? {
            patch: (patch: Partial<typeof block>) => patchBlock(block.id, patch),
            confirm: (request: Confirmation) => confirmation = request,
          } : undefined,
          query: block.kind === 'sql' ? {
            setPreview: (preview: NonNullable<SqlBlock['preview']>) => {
              if (preview !== (block.preview ?? 'query')) patchBlock(block.id, { preview });
            },
            run: () => void runSQL(block, false),
          } : undefined,
          group: block.kind === 'group' ? {
            drop: groupDrop,
            count: childrenByParent.get(block.id)?.length ?? 0,
            focused: block.id === center?.id,
            focusExpanded: members.has(block.id),
            hasInput: visibleLinks.some((link) => link.target === block.id),
            hasOutput: visibleLinks.some((link) => link.source === block.id),
          } : undefined,
          edit: block.kind === 'table' ? {
            workspace,
            toggleLock: () => patchBlock(block.id, { inlineLocked: !block.inlineLocked }),
            patch: (patch: Partial<Block>) => patchBlock(block.id, patch),
            hotkeys: preferences.hotkeys,
            error: message,
            paste: () => { select(block.id); openPaste(block.id); },
            activeCell: activeCell?.tableId === block.id ? activeCell : undefined,
            selectCell: (cell: CellSelection, extend?: boolean) => select(block.id, cell, extend),
          } : undefined,
        },
      };
    });
    const selectedEdges = untrack(() => new Set(flowEdges.filter((edge) => edge.selected).map((edge) => edge.id)));
    flowEdges = visibleLinks.map((link) => ({
      ...link, type: 'smoothstep', selected: selectedEdges.has(link.id),
      ariaLabel: 'Connection from ' + (blocksById.get(link.source)?.title ?? 'source') + ' to ' + (blocksById.get(link.target)?.title ?? 'target'),
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: dark ? '#7185a1' : '#889cb6' },
    }));
  });

  function showQueryTab(tab: 'sql' | 'data') {
    queryViewRevision++;
    activeTab = tab;
  }

  function select(id: string, cell?: CellSelection, extend = false) {
    if (flowEdges.some((edge) => edge.selected)) {
      flowEdges = flowEdges.map((edge) => edge.selected ? { ...edge, selected: false } : edge);
    }
    if (id !== selectedId) showQueryTab('sql');
    selectedId = id;
    if (cell && !cell.axis && extend && activeCell?.tableId === id && !activeCell.axis) {
      const end = activeCell.rowId === cell.rowId && activeCell.columnId === cell.columnId ? undefined : cell;
      activeCell = { ...activeCell, end };
    } else {
      activeCell = cell ? { tableId: id, ...cell } : undefined;
    }
    panel = true;
  }

  function formatSelectedCells(update: (style: CellStyle, row: number, column: number) => CellStyle) {
    if (selected?.kind !== 'table' || !selectedCellBounds) return;
    const cellStyles = updateCellStyles(selected, selectedCellBounds, update);
    if (cellStyles !== selected.cellStyles) patchBlock(selected.id, { cellStyles });
  }

  function toggleSelectedTextStyle(key: CellTextStyle) {
    if (!selectedTableCell) return;
    const enabled = selectedTableCell.format[key] ?? (key === 'bold' && selectedTableCell.defaultBold);
    formatSelectedCells((style) => ({ ...style, [key]: !enabled }));
  }

  function copyCellStyle() {
    if (selected?.kind !== 'table' || !selectedTableCell || !selectedCellBounds) return;
    const { rows, columns, cellStyles } = selected;
    const { row, column } = selectedCellBounds;
    if (activeCell?.axis === 'row') {
      copiedCellStyle = { styles: columns.map(({ id }) => ({ ...cellStyles?.[rows[row].id]?.[id] })) };
      message('Row styles copied');
    } else if (activeCell?.axis === 'column') {
      copiedCellStyle = { styles: rows.map(({ id }) => ({ ...cellStyles?.[id]?.[columns[column].id] })) };
      message('Column styles copied');
    } else {
      copiedCellStyle = { style: { ...selectedTableCell.format } };
      message('Cell style copied');
    }
  }

  function pasteCellStyle() {
    const copied = copiedCellStyle;
    if (!copied || !selectedCellBounds) return;
    if ('style' in copied) {
      formatSelectedCells(() => copied.style);
      return;
    }
    const axis = activeCell?.axis;
    if (!axis) return;
    const { top, left } = selectedCellBounds;
    formatSelectedCells((style, row, column) => copied.styles[axis === 'row' ? column - left : row - top] ?? style);
  }

  function openBlock(id: string) {
    select(id);
    const block = workspace.blocks.find((candidate) => candidate.id === id);
    if (block?.kind === 'table') modal = 'table';
    if (block?.kind === 'chart') modal = 'chart';
    if (block?.kind === 'config') modal = 'config';
    if (block?.kind === 'sql') {
      sqlDraft = block.sql;
      sqlDraftLinks = workspace.links;
      modal = 'sql';
    }
  }

  function addQueryInput(source: string) {
    const draftWorkspace = {
      ...sqlEditorWorkspace,
      blocks: workspace.blocks.map((block) => block.id === selectedId ? { ...block, sql: sqlDraft } : block),
    };
    const next = addLink(draftWorkspace, source, selectedId);
    sqlDraftLinks = next.links;
    const query = next.blocks.find((block) => block.id === selectedId);
    if (query?.kind === 'sql') sqlDraft = query.sql;
  }

  function saveQuery(run: boolean) {
    if (selected?.kind !== 'sql' || !sqlDraft.trim()) return;
    const query = { ...selected, sql: sqlDraft };
    if (query.sql !== selected.sql || sqlDraftLinks.length !== workspace.links.length) {
      replaceWorkspace({ ...workspace, blocks: workspace.blocks.map((block) => block.id === query.id ? query : block), links: sqlDraftLinks });
    }
    closeModal();
    showQueryTab(run ? 'data' : 'sql');
    if (run) void runSQL(query);
  }

  async function focusBlock(id: string) {
    focused = id;
    select(id);
    modal = null;
    await tick();
    await requestFit?.({ ...fitOptions, duration: 260 });
  }

  async function fitCanvas() {
    focused = '';
    await tick();
    await requestFit?.({ ...fitOptions, duration: 240 });
  }

  function nextBlockPosition(block: Block): Position {
    const roots = workspace.blocks.filter((item) => !item.parentId);
    const x = 44 + (roots.length % 3) * 332;
    let y = 166 + Math.floor(roots.length / 3) * 280;
    const size = nodeSize(block);
    for (const item of roots.sort((a, b) => a.position.y - b.position.y)) {
      const bounds = nodeSize(item);
      const left = item.position.x;
      const top = item.position.y;
      if (x < left + bounds.width + 12 && x + size.width + 12 > left && y < top + bounds.height + 24 && y + size.height + 24 > top) {
        y = top + bounds.height + 24;
      }
    }
    return { x, y };
  }

  function groupAtPoint(point: Position, moving?: Block) {
    if (focused) return undefined;
    let hit: GroupBlock | undefined;
    for (const block of workspace.blocks) {
      if (block.kind !== 'group' || block.expanded === false || visibleBlockId(block.id) !== block.id) continue;
      if (moving && !canGroup(moving, block, workspace.blocks)) continue;
      const position = absolutePosition(block, workspace.blocks);
      const size = nodeSize(block);
      if (point.x >= position.x && point.x <= position.x + size.width && point.y >= position.y && point.y <= position.y + size.height
        && (!hit || depth(block) >= depth(hit))) hit = block;
    }
    return hit;
  }

  function groupPosition(point: Position, group: GroupBlock) {
    const origin = absolutePosition(group, workspace.blocks);
    return { x: Math.max(groupInset.x, point.x - origin.x), y: Math.max(groupInset.y, point.y - origin.y) };
  }

  function add(kind: BlockKind, dropPosition?: Position) {
    if (!ready) return;
    const group = dropPosition ? groupAtPoint(dropPosition) : undefined;
    focused = '';
    const block = createBlock(kind, { x: 0, y: 0 });
    block.position = dropPosition ? (group ? groupPosition(dropPosition, group) : dropPosition) : nextBlockPosition(block);
    block.parentId = group?.id;
    if (dropPosition && block.kind === 'table') block.expandedSize = { width: 440, height: 300 };
    replaceWorkspace({ ...workspace, blocks: [...workspace.blocks, block] });
    select(block.id);
    if (kind === 'sql' || kind === 'chart' || kind === 'config' || (kind === 'table' && !dropPosition)) openBlock(block.id);
    if (!dropPosition) void fitCanvas();
  }

  function startBlockDrag(event: DragEvent, kind: BlockKind) {
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(blockDragType, kind);
  }

  function allowBlockDrop(event: DragEvent) {
    if (!event.dataTransfer?.types.includes(blockDragType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const point = canvasPosition?.({ x: event.clientX, y: event.clientY });
    groupDrop.target = point ? groupAtPoint(point)?.id ?? '' : '';
  }

  function dropBlock(event: DragEvent) {
    groupDrop.target = '';
    const kind = blockKinds.find((item) => item === event.dataTransfer?.getData(blockDragType));
    if (!kind || !canvasPosition) return;
    event.preventDefault();
    add(kind, canvasPosition({ x: event.clientX, y: event.clientY }));
  }

  function groupForDrag(node: Node<CardData>, event: MouseEvent | TouchEvent) {
    const block = blocksById.get(node.id);
    const cursor = event instanceof MouseEvent ? event : event.changedTouches[0];
    const point = cursor && canvasPosition?.({ x: cursor.clientX, y: cursor.clientY });
    return block && point ? groupAtPoint(point, block) : undefined;
  }

  function moveDraggedBlock(node: Node<CardData>, event: MouseEvent | TouchEvent) {
    groupDrop.target = '';
    const block = blocksById.get(node.id);
    if (!block) return;
    const group = groupForDrag(node, event);
    const absolute = absolutePosition({ ...block, position: node.position }, workspace.blocks);
    const position = group ? groupPosition(absolute, group) : absolute;
    if (group?.id !== block.parentId || position.x !== block.position.x || position.y !== block.position.y) {
      patchBlock(block.id, { parentId: group?.id, position });
    }
    select(block.id);
  }

  function connect(source: string, target: string) {
    const next = addLink(workspace, source, target);
    if (next === workspace) return;
    const targetBlock = next.blocks.find((block) => block.id === target);
    if (targetBlock?.kind === 'table') {
      const bound = bindTableFormulas(targetBlock, tableInputs(next, target));
      if (bound !== targetBlock) next.blocks = next.blocks.map((block) => block.id === target ? bound : block);
    }
    replaceWorkspace(next);
  }

  function onConnect(connection: Connection) {
    connect(connection.source, connection.target);
  }

  function beforeConnect(connection: Connection) {
    if (!connectionDrag) return connection;
    // Finish the drag at the card under the pointer before using a nearby port.
    connectionDrag.port = connection;
    return false as const;
  }

  const finishConnection: OnConnectEnd = async (event, connection) => {
    const port = connectionDrag?.port;
    connectionDrag = undefined;
    const pointer = event instanceof MouseEvent ? event : event.changedTouches[0];
    const hit = pointer ? document.elementFromPoint(pointer.clientX, pointer.clientY) : null;
    const source = connection.fromHandle?.type === 'source' ? connection.fromNode?.id : undefined;
    const table = hit?.closest('.graph-card.table')?.closest('.svelte-flow__node')?.getAttribute('data-id');
    if (source && table) {
      connect(source, table);
      return;
    }
    if (port) {
      onConnect(port);
      return;
    }
    if (!source || !pointer || !connection.to || connection.fromHandle?.id !== 'quick-create' || connection.toHandle || !hit?.closest('.svelte-flow__pane')) return;
    if (hit.closest('.svelte-flow__node') && !hit.matches('.group-card:not(.collapsed)')) return;
    quickSource = source;
    quickPosition = { ...connection.to };
    modal = 'quick-create';
    await tick();
    if (modal !== 'quick-create' || !quickPicker) return;
    quickPointer = {
      x: Math.max(8, Math.min(pointer.clientX, innerWidth - quickPicker.offsetWidth - 8)),
      y: Math.max(8, Math.min(pointer.clientY, innerHeight - quickPicker.offsetHeight - 8)),
    };
    quickFirstButton?.focus({ preventScroll: true });
  };

  function configureNewBlock(kind: 'table' | 'sql' | 'chart') {
    const source = workspace.blocks.find((block) => block.id === quickSource);
    if (!source || (kind === 'table' && source.kind === 'sql') || (kind === 'chart' && source.kind === 'config')) return closeModal();
    const group = groupAtPoint(quickPosition);
    const created = createBlock(kind, group ? groupPosition(quickPosition, group) : quickPosition);
    created.parentId = group?.id;
    draftBlock = created.kind === 'sql'
      ? { ...created, title: source.title + ' query', sql: 'SELECT *\nFROM "' + sqlAlias(source.title) + '";' }
      : { ...created, title: source.title + ' ' + created.kind };
    modal = 'configure';
  }

  function createConnectedBlock() {
    if (!draftBlock?.title.trim()) return;
    const created = { ...draftBlock, title: draftBlock.title.trim() };
    const next = { ...workspace, blocks: [...workspace.blocks, created] };
    const connected = addLink(next, quickSource, created.id);
    if (connected === next) return closeModal();
    const wasFocused = Boolean(focused);
    focused = '';
    replaceWorkspace(connected);
    select(created.id);
    closeModal();
    if (wasFocused) void fitCanvas();
  }

  function disconnect(id: string) {
    const link = workspace.links.find((candidate) => candidate.id === id);
    if (!link) return;
    replaceWorkspace({ ...workspace, links: workspace.links.filter((candidate) => candidate.id !== id) });
  }

  function moveToGroup(block: Block, groupId: string) {
    const group = workspace.blocks.find((item) => item.id === groupId);
    if (group && !canGroup(block, group, workspace.blocks)) return;
    const siblings = workspace.blocks.filter((item) => item.parentId === groupId && item.id !== block.id);
    const absolute = absolutePosition(block, workspace.blocks);
    const position = group ? { x: groupInset.x, y: Math.max(groupInset.y, ...siblings.map((item) => item.position.y + nodeSize(item).height + 24)) } : absolute;
    patchBlock(block.id, { parentId: group?.id, position });
  }

  function removeBlock(block: Block, confirmDelete = true) {
    if (confirmDelete) {
      confirmation = { title: 'Delete block?', message: 'Delete “' + block.title + '” from this workspace?',
        label: 'Delete block', accept: () => removeBlock(block, false) };
      return;
    }
    replaceWorkspace({
      ...workspace,
      blocks: workspace.blocks.filter((item) => item.id !== block.id).map((item) =>
        item.parentId === block.id ? { ...item, parentId: block.parentId, position: { x: item.position.x + block.position.x, y: item.position.y + block.position.y } } : item),
      links: workspace.links.filter((link) => link.source !== block.id && link.target !== block.id),
    });
    if (selectedId === block.id) {
      selectedId = '';
      activeCell = undefined;
    }
    if (focused === block.id) focused = '';
    modal = null;
  }

  function switchWorkspace(id: string, binding?: WorkspaceFileBinding) {
    library = { ...library, activeId: id };
    workspaceMenu = false;
    focused = '';
    filter = '';
    activeCell = undefined;
    selectedId = workspace.blocks[0]?.id ?? '';
    showQueryTab('sql');
    const saved = binding ? rememberFile(id, binding) : persist();
    initializeComputed(workspace);
    void fitCanvas();
    if (workspaceFiles[id]) {
      fileStates[id] = { kind: 'saving' };
      void checkFile(id);
    }
    return saved;
  }

  function workspaceDialog(rename = false) {
    workspaceMenu = false;
    renamingWorkspace = rename;
    workspaceTitle = rename ? workspace.title : '';
    modal = 'workspace';
  }

  function saveWorkspaceName() {
    const title = workspaceTitle.trim();
    if (!title) return;
    modal = null;
    if (renamingWorkspace) {
      replaceWorkspace({ ...workspace, title });
      return;
    }
    const created = createWorkspace(title);
    library = { ...library, workspaces: [...library.workspaces, created] };
    switchWorkspace(created.id);
  }

  function openPaste(id = '') {
    pasteFromTableDialog = modal === 'table';
    pasteText = '';
    pasteError = '';
    pasteHeader = true;
    const target = workspace.blocks.find((block) => block.id === id);
    pasteNumberFormat = target?.kind === 'table' ? target.numberFormat : 'auto';
    pasteTarget = id;
    modal = 'paste';
  }

  function importPaste(confirmed = false) {
    try {
      const target = workspace.blocks.find((item) => item.id === pasteTarget);
      const hasValues = target?.kind === 'table' && target.rows.some((row) => row.cells.some((cell) => cell.trim()));
      const defaultColumns = target?.kind === 'table' && target.columns.length <= 2
        && target.columns.every((column, index) => column.name === columnLetter(index) && column.type === 'auto');
      const legacyDefaultColumn = target?.kind === 'table' && target.columns.length === 1
        && target.columns[0].name === 'Column 1' && target.columns[0].type === 'text';
      const existing = target?.kind === 'table' && (hasValues || (!defaultColumns && !legacyDefaultColumn)) ? target.columns : undefined;
      const data = bindTableFormulas(importGrid(parseDelimited(pasteText), pasteHeader, pasteNumberFormat, existing), tableInputs(workspace, pasteTarget));
      if (target?.kind === 'table') {
        if (hasValues && !confirmed) {
          confirmation = { title: 'Replace table data?', message: 'Replace the existing data in “' + target.title + '”?',
            label: 'Replace data', accept: () => importPaste(true) };
          return;
        }
        patchBlock(target.id, {
          ...data, numberFormat: pasteNumberFormat,
          titleColumns: Math.min(target.titleColumns ?? 0, data.columns.length),
          footerRows: Math.min(target.footerRows ?? 0, data.rows.length),
          columnWidths: target.columnWidths && Object.fromEntries(data.columns.flatMap(({ id }) => {
            const width = target.columnWidths?.[id];
            return width === undefined ? [] : [[id, width]];
          })),
          rowHeights: undefined,
          cellStyles: undefined,
        });
        modal = pasteFromTableDialog ? 'table' : null;
      } else {
        const block = {
          ...createBlock('table', { x: 0, y: 0 }),
          ...data, title: 'Pasted data', numberFormat: pasteNumberFormat,
        };
        block.position = nextBlockPosition(block);
        replaceWorkspace({ ...workspace, blocks: [...workspace.blocks, block] });
        select(block.id);
        modal = 'table';
        void fitCanvas();
      }
      message(countLabel(data.rows.length, 'row') + ' pasted');
    } catch (error) {
      pasteError = error instanceof Error ? error.message : String(error);
    }
  }

  function closeModal() {
    if (modal === 'sql') {
      sqlDraft = '';
      sqlDraftLinks = [];
    }
    modal = modal === 'paste' && pasteFromTableDialog ? 'table' : null;
    draftBlock = undefined;
  }
  function keyboard(event: KeyboardEvent) {
    if (confirmation) return;
    if (event.key === 'Escape' && modal === 'quick-create') closeModal();
    if (event.defaultPrevented || event.isComposing) return;
    const shortcut = eventHotkey(event);
    if (!shortcut) return;
    const { hotkeys } = preferences;
    const target = event.target instanceof HTMLElement ? event.target : undefined;
    if (target?.closest('.column-settings-dialog')) return;
    const cell = target?.closest<HTMLElement>('td[data-table-cell]');
    const tableSelection = cell ?? target?.closest('[data-table-selection]');
    const editingText = target?.closest('input, textarea, select, [contenteditable]');
    const undo = shortcut === hotkeys.undo;
    const redo = shortcut === hotkeys.redo
      || (shortcut === 'Mod+Y' && !isMac() && hotkeys.redo === defaultHotkeys.redo && !Object.values(hotkeys).includes(shortcut));
    if ((undo || redo) && (!modal || modal === 'table') && (cell || !editingText)
      && !target?.closest('.cell-color-dialog')) {
      event.preventDefault();
      if (target?.matches('textarea[data-table-cell]')) cell?.focus({ preventScroll: true });
      stepHistory(undo ? 'undo' : 'redo');
      return;
    }
    const textStyle = shortcut === hotkeys.toggleBold ? 'bold' : shortcut === hotkeys.toggleItalic ? 'italic'
      : shortcut === hotkeys.toggleUnderline ? 'underline' : undefined;
    if ((textStyle || shortcut === hotkeys.copyCellStyle || shortcut === hotkeys.pasteCellStyle) && selectedTableCell
      && (modal === 'table' || (!modal && selected?.kind === 'table' && selected.expanded !== false && !selected.inlineLocked))) {
      if (target?.closest('.cell-color-dialog') || (editingText && !cell && !target?.closest('.cell-format-controls'))) return;
      event.preventDefault();
      if (event.repeat) return;
      if (textStyle) toggleSelectedTextStyle(textStyle);
      else if (shortcut === hotkeys.copyCellStyle) copyCellStyle();
      else pasteCellStyle();
      return;
    }
    if (modal) return;
    if (shortcut === hotkeys.search) {
      event.preventDefault();
      blockSearch?.focus();
      return;
    }
    if (shortcut === hotkeys.runQuery && selected?.kind === 'sql') {
      event.preventDefault();
      void runSQL(selected);
      return;
    }
    if (editingText || tableSelection) return;
    if (shortcut === hotkeys.deleteBlock && !event.repeat) {
      const edge = flowEdges.find((edge) => edge.selected);
      if (edge) {
        event.preventDefault();
        disconnect(edge.id);
      } else if (selected) {
        event.preventDefault();
        removeBlock(selected, preferences.confirmHotkeyDelete);
      }
    }
  }

  function queryShortcut(event: KeyboardEvent) {
    if (modal !== 'sql' || event.repeat || eventHotkey(event) !== preferences.hotkeys.runQuery) return;
    event.preventDefault();
    event.stopPropagation();
    saveQuery(true);
  }

  let selectedChart = $derived(selected?.kind === 'chart' ? chartInput(selected) : {});
  let selectedSeries = $derived(selected?.kind === 'chart' ? chartSeries(selected, selectedChart.result) : undefined);
  let quickInput = $derived(workspace.blocks.find((block) => block.id === quickSource));
  let quickColumns = $derived(quickInput?.kind === 'table' ? tableData(quickInput, workspace).columns : quickInput?.kind === 'sql' ? runtime[quickInput.id]?.result?.columns ?? [] : []);
  let candidates = $derived(selected ? workspace.blocks.filter((block) => canConnect(workspace, block.id, selected!.id)) : []);
  let sqlEditorWorkspace = $derived({ ...workspace, links: sqlDraftLinks });
  let sqlCandidates = $derived(modal === 'sql' ? workspace.blocks.filter((block) =>
    canConnect(sqlEditorWorkspace, block.id, selectedId)) : []);
</script>

<svelte:window onkeydown={keyboard} onkeydowncapture={queryShortcut}
  onfocus={() => { if (ready && workspaceFile && !fileAction) void checkFile(workspace.id); }} />
<input type="file" hidden accept=".json,application/json" aria-label="Import workspace file" bind:this={fileInput} onchange={importFile} />

{#snippet sqlCode(value: string, change: (text: string) => void, autofocus = false)}
  {#await import('./components/SqlEditor.svelte')}
    <p class="query-editor-loading" role="status">Loading SQL editor…</p>
  {:then { default: Editor }}
    <Editor {value} {change} {autofocus} />
  {:catch}
    <textarea class="query-editor-fallback" aria-label="SQL code" spellcheck="false" {value}
      oninput={(event) => change(event.currentTarget.value)}></textarea>
  {/await}
{/snippet}

{#snippet inspectCell()}
  {#if selectedTableCell}
    <CellInspector {...selectedTableCell} axis={activeCell?.axis} hotkeys={preferences.hotkeys} canPaste={canPasteCellStyle}
      clear={() => activeCell = undefined} copyStyle={copyCellStyle} pasteStyle={pasteCellStyle}
      toggleTextStyle={toggleSelectedTextStyle}
      changeStyle={(patch) => formatSelectedCells((style) => ({ ...style, ...patch }))}
      resetStyle={() => formatSelectedCells(() => ({}))} />
  {/if}
{/snippet}

<div class="app-shell">
  <header class="app-header">
    <div class="header-left">
      <div class="header-brand"><div class="brand-mark"><Workflow size={21} strokeWidth={2} /></div><span>DataFlow</span></div>
      <div class="history-actions" role="group" aria-label="Workspace history">
        <button class="icon-button" type="button" aria-label="Undo" title={'Undo (' + hotkeyLabel(preferences.hotkeys.undo) + ')'} disabled={!history?.undo.length} onclick={() => stepHistory('undo')}><Undo2 size={18} /></button>
        <button class="icon-button" type="button" aria-label="Redo" title={'Redo (' + hotkeyLabel(preferences.hotkeys.redo) + ')'} disabled={!history?.redo.length} onclick={() => stepHistory('redo')}><Redo2 size={18} /></button>
      </div>
      <div class="header-divider"></div>
      <div class="workspace-switch">
        <button class="workspace-trigger" aria-label="Workspaces" aria-expanded={workspaceMenu} onclick={() => workspaceMenu = !workspaceMenu}>
          <span>{workspace.title}</span><ChevronDown size={14} />
        </button>
        {#if workspaceMenu}
          <div class="workspace-menu">
            <p>WORKSPACES</p>
            {#each library.workspaces as item (item.id)}
              <button class:current={library.activeId === item.id} onclick={() => switchWorkspace(item.id)}>
                {#if workspaceFiles[item.id]}<FileText size={15} />{:else}<Layers3 size={15} />{/if}
                <span>{item.title}</span>{#if library.activeId === item.id}<Check size={14} />{/if}
              </button>
            {/each}
            <hr class="workspace-menu-divider" />
            <button onclick={() => workspaceDialog(true)}><Layers3 size={15} /> Rename workspace</button>
            <button onclick={() => workspaceDialog()}><Plus size={15} /> New workspace</button>
            <div class="workspace-file-actions">
              {#if supportsWorkspaceFiles()}
                <button disabled={!ready || fileAction} onclick={openFile}><FolderOpen size={15} /> Open file…</button>
                <button disabled={!ready || fileAction} onclick={saveAsFile}><FileText size={15} /> {workspaceFile ? 'Save as new file…' : 'Save as file…'}</button>
              {/if}
              <button disabled={!ready || fileAction} onclick={() => { workspaceMenu = false; fileInput.click(); }}><FolderOpen size={15} /> Import a copy…</button>
              <button disabled={!ready} onclick={() => { workspaceMenu = false; downloadWorkspaceDocument(workspace); }}><Download size={15} /> Export a copy</button>
              {#if workspaceFile}
                <button disabled={fileAction} onclick={() => void checkCurrentFile()}><FileText size={15} /> Check file</button>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
    {#key workspace.id}
      <BlockSearch bind:this={blockSearch} blocks={workspace.blocks} {icons} shortcut={hotkeyLabel(preferences.hotkeys.search)} onPick={focusBlock} />
    {/key}
    <div class="header-right">
      {#if workspaceFile}
        <div class="file-save-state" title={workspaceFile.handle.name}>
          {#if fileState?.kind === 'conflict'}
            <button class="save-state file-state-action" onclick={() => modal = 'workspace-file'}><CircleAlert size={15} /> File changed</button>
          {:else if fileState?.kind === 'permission'}
            <button class="save-state file-state-action" onclick={() => modal = 'workspace-file'}><CircleAlert size={15} /> Enable file autosave</button>
          {:else if fileState?.kind === 'error' || saveState === 'error'}
            <button class="save-state file-state-action" onclick={() => modal = 'workspace-file'}><CircleAlert size={15} /> Check file saving</button>
          {:else if fileState?.kind === 'saved'}
            <span class="save-state"><FileText size={15} /> Saved to file</span>
          {:else}
            <span class="save-state"><span class="save-dot"></span> Checking file…</span>
          {/if}
        </div>
      {:else}
        <span class="save-state" title="Stored in this browser">{#if saveState === 'error'}<CircleAlert size={15} /> Could not save{:else if saveState === 'saving'}<span class="save-dot"></span> Saving…{:else}<CloudOff size={15} /> Saved locally{/if}</span>
      {/if}
      <button class="icon-button settings-trigger" aria-label="Settings" title="Settings" onclick={() => modal = 'settings'}><SettingsIcon size={18} /></button>
    </div>
  </header>

  <div class="workspace-layout" class:panel-open={panel && Boolean(selected)}>
    <aside class="sidebar" aria-label="Workspace blocks">
      <div class="sidebar-head"><span class="section-kicker">WORKSPACE</span><button class="icon-button small" title="New workspace" aria-label="New workspace" onclick={() => workspaceDialog()}><Plus size={17} /></button></div>
      <button class="canvas-nav" onclick={() => void fitCanvas()}><Layers3 size={16} /><span>Canvas</span><span class="nav-dot"></span></button>
      <div class="sidebar-divider"></div>
      <div class="sidebar-head block-head"><span class="section-kicker">BLOCKS</span><span class="block-count">{workspace.blocks.length}</span></div>
      <label class="sidebar-filter"><Search size={14} /><input placeholder="Filter blocks…" bind:value={filter} aria-label="Filter blocks" />{#if filter}<button aria-label="Clear filter" onclick={() => filter = ''}><X size={12} /></button>{/if}</label>
      <div class="block-list">
        {#each blockKinds as kind}
          {@const Icon = icons[kind]}
          {@const matches = workspace.blocks.filter((block) => block.kind === kind && block.title.toLowerCase().includes(filter.toLowerCase()))}
          {#if !filter || matches.length}
            <div class="block-category">
              <div class="category-title"><span>{kinds[kind].plural}</span><button class="icon-button small" aria-label={addLabel(kind) + ' from sidebar'} onclick={() => add(kind)}><Plus size={14} /></button></div>
              {#each matches as block (block.id)}
                <button class="sidebar-block" class:active={selectedId === block.id} onclick={() => select(block.id)} ondblclick={() => focusBlock(block.id)}><Icon size={15} class={'color-' + kind} /><span>{block.title}</span></button>
              {/each}
            </div>
          {/if}
        {/each}
        {#if filter && !workspace.blocks.some((block) => block.title.toLowerCase().includes(filter.toLowerCase()))}<p class="sidebar-empty">No matching blocks</p>{/if}
      </div>
      <div class="sidebar-foot"><span class="save-dot"></span><span>Local workspace</span></div>
    </aside>

    <main class="canvas-panel" aria-label="DataFlow canvas">
      <div class="canvas-header">
        <div class="canvas-title"><h1>Canvas</h1>{#if focused}<button class="focus-clear" onclick={() => void fitCanvas()} aria-label="Exit focus view"><X size={13} /> Exit focus</button>{:else if workspace.sample}<span class="sample-label">Sample data</span>{/if}</div>
        <div class="canvas-actions">
          {#each blockKinds as kind}
            {@const Icon = icons[kind]}
            <button class="button ghost compact-button canvas-block-tool" draggable="true" ondragstart={(event) => startBlockDrag(event, kind)}
              ondragend={() => groupDrop.target = ''}
              aria-label={addLabel(kind)} title={addLabel(kind) + ' · Click or drag onto the canvas'} onclick={() => add(kind)}><Icon size={16} /><span>{kind === 'sql' ? 'SQL' : kinds[kind].label}</span></button>
          {/each}
          <span class="action-divider"></span>
          <button class="button primary compact-button" aria-label="Paste data" onclick={() => openPaste()}><ClipboardPlus size={15} /><span>Paste data</span></button>
          {#if selected && !panel}<button class="icon-button" aria-label="Open inspector" onclick={() => panel = true}><PanelRightOpen size={18} /></button>{/if}
        </div>
      </div>
      <div class="canvas-stage" role="region" aria-label="Canvas drop area" ondragover={allowBlockDrop} ondrop={dropBlock}
        ondragleave={(event) => {
          if (!(event.relatedTarget instanceof Element) || !event.currentTarget.contains(event.relatedTarget)) groupDrop.target = '';
        }}>
        {#if ready}
          <SvelteFlow
            bind:nodes={flowNodes}
            bind:edges={flowEdges}
            {nodeTypes}
            style={'color-scheme: ' + (dark ? 'dark' : 'light')}
            fitView
            fitViewOptions={fitOptions}
            minZoom={.25}
            maxZoom={2}
            nodesConnectable
            nodesDraggable={!focused}
            deleteKey={null}
            onconnectstart={() => connectionDrag = {}}
            onbeforeconnect={beforeConnect}
            onconnect={onConnect}
            onconnectend={finishConnection}
            isValidConnection={({ source, target, sourceHandle }) =>
              (sourceHandle !== 'quick-create' || blocksById.get(target)?.kind === 'table') && canConnect(workspace, source, target)}
            onnodeclick={({ node, event }) => {
              if (!(event.target instanceof Element && event.target.closest('[data-table-cell], [data-table-selection], .column-settings-dialog'))) select(node.id);
            }}
            onpaneclick={() => activeCell = undefined}
            onselectionchange={({ edges }) => { if (edges.length) { selectedId = ''; activeCell = undefined; } }}
            onnodedrag={({ targetNode, event }) => { groupDrop.target = targetNode ? groupForDrag(targetNode, event)?.id ?? '' : ''; }}
            onnodedragstop={({ targetNode, event }) => { if (targetNode) moveDraggedBlock(targetNode, event); }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={19} size={1.1} patternColor={dark ? '#46526a' : '#c7d2e0'} />
            <MiniMap nodeColor={(node) => {
              const kind = (node.data as CardData).block.kind;
              return kind === 'sql' ? '#a697f0' : kind === 'chart' ? '#69beaf' : kind === 'group' ? '#9da9ba' : '#94aff9';
            }} height={88} width={144} maskColor={dark ? '#111827a0' : '#edf2f8af'} pannable zoomable />
            <CanvasControls connect={(fit, position) => { requestFit = fit; canvasPosition = position; void fitCanvas(); }} fit={() => void fitCanvas()} />
          </SvelteFlow>
          {#if workspace.blocks.length === 0}
            <div class="empty-canvas"><div class="empty-icon"><Layers3 size={27} /></div><h2>This canvas is empty</h2><p>Paste a range from Numbers or Excel, or add a table to get started.</p><button class="button primary" onclick={() => openPaste()}><ClipboardPlus size={16} /> Paste data</button></div>
          {/if}
        {/if}
      </div>
      <footer class="canvas-footer"><span><span class="save-dot"></span> {workspace.title}</span><span>{countLabel(workspace.blocks.length, 'block')} <span class="separator">·</span> {countLabel(workspace.links.length, 'connection')}</span><span class="canvas-hint">Drag to pan <span class="separator">·</span> Scroll to zoom</span></footer>
    </main>

    {#if selected && panel}
      {@const block = selected}
      {@const Icon = icons[block.kind]}
      <aside class="inspector" aria-label="Block inspector">
        <div class="inspector-top"><span class="section-kicker">INSPECTOR</span><button class="icon-button small" aria-label="Close inspector" onclick={() => panel = false}><PanelRightClose size={17} /></button></div>
        <div class="inspector-title"><span class="kind-icon {block.kind}"><Icon size={19} /></span><div><span>{kinds[block.kind].label}</span><h2>{block.title}</h2></div></div>
        <div class="inspector-scroll" bind:this={inspectorScroll}>
          {#if block.kind === 'sql'}
            <div class="tabs" aria-label="Query views"><button class:active={activeTab === 'sql'} onclick={() => showQueryTab('sql')}>SQL</button><button class:active={activeTab === 'data'} onclick={() => showQueryTab('data')}>Data</button></div>
            <div class="inspector-body">
              {#if activeTab === 'sql'}
                <pre class="query-preview"><code>{block.sql || '-- Write a query'}</code></pre>
                <button class="button secondary full-width" onclick={() => openBlock(block.id)}><Pencil size={14} /> Edit SQL</button>
              {:else if runtime[block.id]?.result}
                {@const result = runtime[block.id].result!}
                <div class="result-summary"><span>{countLabel(result.rows.length, 'row')}</span>{#if runtime[block.id].state !== 'ready'}<span class="inline-warning">Previous result</span>{/if}</div>
                <ResultGrid {result} />
                {#if result.rows.length > 8}<p class="helper-text">Showing the first 8 rows.</p>{/if}
              {:else}
                <p class="inspector-empty">Run the query to see its result.</p>
              {/if}
              {#if runtime[block.id]?.error}<p class="inline-error" role="alert"><CircleAlert size={15} />{runtime[block.id].error}</p>{/if}
              <button class="button primary run-button" onclick={() => void runSQL(block)} disabled={runtime[block.id]?.state === 'running'}><Play size={14} fill="currentColor" /> {runtime[block.id]?.state === 'running' ? 'Running…' : 'Run query'}<kbd aria-hidden="true">{hotkeyLabel(preferences.hotkeys.runQuery)}</kbd></button>
            </div>
          {:else if block.kind === 'table'}
            {@const issue = tableProblem(block)}
            {#if selectedTableCell && block.expanded !== false && !block.inlineLocked}
              {@render inspectCell()}
            {/if}
            <div class="inspector-body">
              <div class="result-summary"><span>{countLabel(block.rows.length, 'row')} <span class="separator">·</span> {countLabel(block.columns.length, 'column')}</span></div>
              {#if issue}<p class="inline-error"><CircleAlert size={15} />{issue}</p>{/if}
              <button class="button primary full-width" onclick={() => modal = 'table'}><Table2 size={15} /> Edit table</button>
            </div>
          {:else if block.kind === 'chart'}
            <div class="inspector-body">
              {#if selectedChart.error}<p class="inline-error" role="alert"><CircleAlert size={15} />{selectedChart.error}</p>
              {:else if selectedChart.state && selectedChart.state !== 'ready'}<p class="inline-warning">{selectedChart.state === 'running' ? 'Refreshing data…' : 'Source result may be out of date'}</p>{/if}
              {#if selectedSeries}<div class="inspector-chart"><MiniChart series={selectedSeries} type={block.chart} {dark} compact /></div>{/if}
              {#if inputLinks.length && selectedChart.state !== 'ready'}
                <button class="button secondary full-width" disabled={selectedChart.state === 'running'} onclick={() => refreshChart(block)}><RefreshCw size={14} /> Refresh chart</button>
              {/if}
              <button class="button secondary full-width" onclick={() => openBlock(block.id)}><Maximize size={15} /> Open chart</button>
            </div>
          {:else if block.kind === 'config'}
            <div class="inspector-body">
              <div class="result-summary">{countLabel(block.fields.length, 'field')} · {countLabel(block.presets.length, 'preset')}</div>
              <button class="button secondary full-width" onclick={() => openBlock(block.id)}><SlidersHorizontal size={15} /> Open config</button>
            </div>
          {:else}
            <div class="inspector-body"><p class="helper-text">{countLabel(workspace.blocks.filter((item) => item.parentId === block.id).length, 'block')} in this group</p></div>
          {/if}

          {#if block.kind !== 'group'}
            <section class="inspector-section" aria-label="Block connections">
              <div class="section-title"><ArrowDownLeft size={15} /><h3>Inputs</h3><span>{inputLinks.length}</span></div>
              {#each inputLinks as link (link.id)}
                {@const input = workspace.blocks.find((item) => item.id === link.source)}
                <div class="connection-row"><button class="connection-link" onclick={() => focusBlock(link.source)}><Link2 size={14} /><span>{input?.title ?? 'Source'}</span></button><button class="icon-button small" aria-label={'Disconnect ' + (input?.title ?? 'source')} onclick={() => disconnect(link.id)}><Unplug size={13} /></button></div>
                {#if block.kind === 'sql'}<code class="connection-alias">{link.alias}</code>
                {:else if block.kind === 'table'}<code class="connection-alias">{link.alias}{input?.kind === 'config' ? '.Field' : '::…'}</code>{/if}
              {/each}
              {#if candidates.length}<select aria-label="Connect input" class="inline-select" value="" onchange={(event) => { const id = event.currentTarget.value; if (id) connect(id, block.id); event.currentTarget.value = ''; }}><option value="">Connect input…</option>{#each candidates as item}<option value={item.id}>{item.title}</option>{/each}</select>
              {:else if inputLinks.length === 0 && block.kind !== 'config'}<p class="helper-text">{block.kind === 'table' ? 'Connect a table or config to reference its values.' : 'Add a data source to connect it.'}</p>{/if}
              {#if block.kind !== 'chart'}
                <div class="section-title spaced"><ArrowUpRight size={15} /><h3>Outputs</h3><span>{outputLinks.length}</span></div>
                {#each outputLinks as link (link.id)}
                  <button class="connection-row connection-link" onclick={() => focusBlock(link.target)}><Link2 size={14} /><span>{workspace.blocks.find((item) => item.id === link.target)?.title ?? 'Target'}</span></button>
                {/each}
                {#if outputLinks.length === 0}<p class="helper-text">No connected outputs</p>{/if}
              {/if}
            </section>
          {/if}

          <section class="inspector-section block-settings" aria-label="Block settings">
            <label class="field">Name<input value={block.title} onchange={(event) => { event.currentTarget.value = renameBlock(block.id, event.currentTarget.value); }} /></label>
            {#if workspace.blocks.some((item) => canGroup(block, item, workspace.blocks))}
              <label class="field">Group<select value={block.parentId ?? ''} onchange={(event) => moveToGroup(block, event.currentTarget.value)}><option value="">None</option>{#each workspace.blocks.filter((item) => canGroup(block, item, workspace.blocks)) as item}<option value={item.id}>{item.title}</option>{/each}</select></label>
            {/if}
            <div class="inspector-buttons"><button class="button ghost" onclick={() => focusBlock(block.id)}><Focus size={15} /> Focus</button><button class="button ghost delete-block" onclick={() => removeBlock(block)}><Trash2 size={15} /> Delete block</button></div>
          </section>
        </div>
      </aside>
    {/if}
  </div>

  {#if notice}<div class="toast" role="status"><Check size={15} /><span>{notice}</span><button class="icon-button small" aria-label="Dismiss message" onclick={() => notice = ''}><X size={14} /></button></div>{/if}
</div>

{#if modal === 'quick-create'}
  <div class="quick-overlay">
    <button class="quick-backdrop" aria-label="Cancel adding a connected block" tabindex="-1" onclick={closeModal}></button>
    <div bind:this={quickPicker} class="quick-picker" role="group" aria-label="Add connected block" style:left={quickPointer.x + 'px'} style:top={quickPointer.y + 'px'}>
      <p>Connect from <strong>{quickInput?.title}</strong></p>
      <button bind:this={quickFirstButton} onclick={() => configureNewBlock('sql')}><span class="kind-icon sql"><Braces size={16} /></span><span>SQL query<small>Filter or calculate</small></span></button>
      {#if quickInput?.kind !== 'config'}
        <button onclick={() => configureNewBlock('chart')}><span class="kind-icon chart"><ChartColumnIncreasing size={16} /></span><span>Chart<small>Plot the source data</small></span></button>
      {/if}
      {#if quickInput?.kind === 'table' || quickInput?.kind === 'config'}
        <button onclick={() => configureNewBlock('table')}><span class="kind-icon table"><Table2 size={16} /></span><span>Table<small>Reference the source in formulas</small></span></button>
      {/if}
    </div>
  </div>
{:else if modal === 'configure' && draftBlock}
  {@const draft = draftBlock}
  {@const kindLabel = kinds[draft.kind].label}
  {#snippet content()}
    <label class="field">Name<input maxlength="100" bind:value={draft.title}
      onkeydown={(event) => {
        if (draft.kind === 'table' && event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          createConnectedBlock();
        }
      }} /></label>
    {#if draft.kind === 'sql'}
      {@render sqlCode(draft.sql, (text) => draft.sql = text)}
    {:else if draft.kind === 'chart'}
      <label class="field">Chart type<select bind:value={draft.chart}><option value="bar">Bar</option><option value="line">Line</option></select></label>
      {#if quickColumns.length}
        <label class="field">X axis<select bind:value={draft.x}><option value="">Automatic</option>{#each quickColumns as column}<option value={column.name}>{column.name}</option>{/each}</select></label>
        <label class="field">Y axis<select bind:value={draft.y}><option value="">Automatic</option>{#each quickColumns.filter((column) => column.type === 'decimal') as column}<option value={column.name}>{column.name}</option>{/each}</select></label>
      {/if}
    {/if}
  {/snippet}
  {#snippet footer()}
    <button class="button secondary" onclick={closeModal}>Cancel</button>
    <button class="button primary" onclick={createConnectedBlock} disabled={!draft.title.trim() || (draft.kind === 'sql' && !draft.sql.trim())}>Create {draft.kind === 'sql' ? kindLabel : kindLabel.toLowerCase()}</button>
  {/snippet}
  <Modal title={'Configure ' + (draft.kind === 'sql' ? kindLabel : kindLabel.toLowerCase())} subtitle={'Input: ' + (quickInput?.title ?? '')} wide={draft.kind === 'sql'} close={closeModal} children={content} {footer} />
{:else if modal === 'sql' && selected?.kind === 'sql'}
  {#snippet content()}
    <div class="query-inputs">
      {#if sqlCandidates.length}
        <select aria-label="Connect input" class="inline-select" value="" onchange={(event) => {
          if (event.currentTarget.value) addQueryInput(event.currentTarget.value);
          event.currentTarget.value = '';
        }}>
          <option value="">Connect input…</option>
          {#each sqlCandidates as input (input.id)}<option value={input.id}>{input.title}</option>{/each}
        </select>
      {/if}
      {#each sqlDraftLinks.filter((link) => link.target === selectedId) as link (link.id)}
        <code class="connection-alias" title={workspace.blocks.find((block) => block.id === link.source)?.title}>{link.alias}</code>
      {/each}
    </div>
    {@render sqlCode(sqlDraft, (text) => sqlDraft = text, true)}
  {/snippet}
  {#snippet footer()}
    <button class="button secondary" onclick={closeModal}>Cancel</button>
    <button class="button secondary" disabled={!sqlDraft.trim()} onclick={() => saveQuery(false)}>Save</button>
    <button class="button primary" disabled={!sqlDraft.trim()} onclick={() => saveQuery(true)}><Play size={14} /> Save and run</button>
  {/snippet}
  <Modal title="Edit SQL" subtitle={selected.title} wide close={closeModal} children={content} {footer} />
{:else if modal === 'settings'}
  <Settings {preferences} change={(next) => preferences = next} close={closeModal} />
{:else if modal === 'workspace-file' && workspaceFile}
  {#snippet content()}
    {#if fileState?.kind === 'conflict'}
      <p>The file changed outside DataFlow. Autosave is paused. Open the file version to keep any unsaved edits as a separate browser workspace, or save your current work to a different file.</p>
    {:else if fileState?.kind === 'permission'}
      <p>Allow DataFlow to write to this file to resume autosave. Your edits are saved in this browser while access is paused.</p>
    {:else}
      <p>{fileState?.message ?? 'Check whether the file and the browser copy can be saved.'}</p>
    {/if}
    {#if saveState === 'error'}<p class="inline-error">The browser could not save your draft. Export a copy to keep your edits.</p>{/if}
  {/snippet}
  {#snippet footer()}
    <button class="button secondary" onclick={closeModal}>Close</button>
    {#if fileState?.kind === 'conflict'}
      <button class="button secondary" disabled={fileAction} onclick={saveAsFile}>Save as new file…</button>
      <button class="button primary" disabled={fileAction} onclick={openDiskVersion}>Open file version</button>
    {:else if fileState?.kind === 'permission'}
      <button class="button primary" disabled={fileAction} onclick={enableFileAutosave}>Allow file access</button>
    {:else}
      <button class="button secondary" onclick={() => downloadWorkspaceDocument(workspace)}>Export a copy</button>
      <button class="button primary" disabled={fileAction} onclick={() => void checkCurrentFile()}>Check again</button>
    {/if}
  {/snippet}
  <Modal title={fileState?.kind === 'conflict' ? 'File changed on disk' : 'Workspace file'} subtitle={workspaceFile.handle.name} close={closeModal} children={content} {footer} />
{:else if modal === 'workspace'}
  {#snippet content()}
    <label class="field">Workspace name<input maxlength="100" bind:value={workspaceTitle} placeholder="e.g. Home budget" onkeydown={(event) => { if (event.key === 'Enter') saveWorkspaceName(); }} /></label>
  {/snippet}
  {#snippet footer()}<button class="button secondary" onclick={closeModal}>Cancel</button><button class="button primary" onclick={saveWorkspaceName} disabled={!workspaceTitle.trim()}>{renamingWorkspace ? 'Save name' : 'Create workspace'}</button>{/snippet}
  <Modal title={renamingWorkspace ? 'Rename workspace' : 'New workspace'} close={closeModal} children={content} {footer} />
{:else if modal === 'paste'}
  {#snippet content()}
    <label class="field">Cell range<textarea class="paste-editor" placeholder={'Date\tCategory\tAmount\n2026-01-01\tGroceries\t24.50'} bind:value={pasteText} spellcheck="false"
      onkeydown={(event) => {
        if (!pasteTarget && event.key === 'Enter' && !event.shiftKey && !event.isComposing && pasteText.trim()) {
          event.preventDefault();
          importPaste();
        }
      }}></textarea></label>
    <div class="paste-options"><label class="checkbox"><input type="checkbox" bind:checked={pasteHeader} /> First row contains headers</label>
    <label class="field">Number format<select bind:value={pasteNumberFormat}><option value="auto">Detect automatically</option><option value="decimal-comma">1.234,56</option><option value="decimal-point">1,234.56</option></select></label></div>
    {#if pasteError}<p class="inline-error" role="alert"><CircleAlert size={15} />{pasteError}</p>{/if}
  {/snippet}
  {#snippet footer()}<button class="button secondary" onclick={closeModal}>Cancel</button><button class="button primary" onclick={() => importPaste()} disabled={!pasteText.trim()}><ClipboardPlus size={15} /> {pasteTarget ? 'Replace table data' : 'Create table'}</button>{/snippet}
  <Modal title="Paste data" subtitle="Copy a cell range in Numbers or Excel and paste it below." close={closeModal} children={content} {footer} />
{:else if modal === 'table' && selected?.kind === 'table'}
  {@const table = selected}
  {#snippet content()}
    <div class="table-dialog-layout">
      <div class="table-dialog-editor">
        <TableEditor block={table} {workspace} hotkeys={preferences.hotkeys} change={(patch) => patchBlock(table.id, patch)}
          paste={() => openPaste(table.id)} error={message} activeCell={activeCell} selectCell={(cell, extend) => select(table.id, cell, extend)} />
      </div>
      <aside class="table-dialog-inspector" aria-label="Cell inspector">
        {#if selectedTableCell}
          {@render inspectCell()}
        {:else}
          <p class="helper-text">Select a cell to format it or inspect its formula.</p>
        {/if}
      </aside>
    </div>
  {/snippet}
  {#snippet footer()}<button class="button primary" onclick={closeModal}>Done</button>{/snippet}
  <Modal title={table.title} subtitle="Table" wide close={closeModal} children={content} {footer} />
{:else if modal === 'config' && selected?.kind === 'config'}
  {@const block = selected}
  {#snippet content()}
    <label class="field">Name<input maxlength="100" value={block.title}
      onchange={(event) => event.currentTarget.value = renameBlock(block.id, event.currentTarget.value)} /></label>
    <ConfigEditor {block} change={(patch) => patchBlock(block.id, patch)} confirm={(request) => confirmation = request} manage />
  {/snippet}
  {#snippet footer()}<button class="button primary" onclick={closeModal}>Done</button>{/snippet}
  <Modal title={block.title} subtitle="Config" close={closeModal} children={content} {footer} />
{:else if modal === 'chart' && selected?.kind === 'chart'}
  {@const chart = selected}
  {#snippet content()}
    <div class="chart-settings">
      {#if candidates.length || inputLinks.length}
        <label class="field">Source<select value={inputLinks[0]?.source ?? ''} onchange={(event) => {
          if (event.currentTarget.value) connect(event.currentTarget.value, chart.id);
          else if (inputLinks[0]) disconnect(inputLinks[0].id);
        }}>
          <option value="">No source</option>
          {#if inputLinks[0]}<option value={inputLinks[0].source}>{workspace.blocks.find((block) => block.id === inputLinks[0].source)?.title ?? 'Source'}</option>{/if}
          {#each candidates as input (input.id)}<option value={input.id}>{input.title}</option>{/each}
        </select></label>
      {/if}
      <label class="field">Chart type<select value={chart.chart} onchange={(event) => patchBlock(chart.id, { chart: event.currentTarget.value as ChartBlock['chart'] })}><option value="bar">Bar</option><option value="line">Line</option></select></label>
      {#if selectedChart.result}
        <label class="field">X axis<select value={chart.x} onchange={(event) => patchBlock(chart.id, { x: event.currentTarget.value })}><option value="">Automatic</option>{#each selectedChart.result.columns as column}<option value={column.name}>{column.name}</option>{/each}</select></label>
        <label class="field">Y axis<select value={chart.y} onchange={(event) => patchBlock(chart.id, { y: event.currentTarget.value })}><option value="">Automatic</option>{#each selectedChart.result.columns.filter((column) => column.type === 'decimal') as column}<option value={column.name}>{column.name}</option>{/each}</select></label>
      {/if}
    </div>
    {#if selectedSeries}<div class="expanded-chart"><MiniChart series={selectedSeries} type={chart.chart} {dark} /></div>
      {#if selectedSeries.truncated}<p class="helper-text">Showing the first 100 rows.</p>{/if}
    {:else if selectedChart.error}<p class="inline-error"><CircleAlert size={15} />{selectedChart.error}</p>
    {:else}<p class="inspector-empty">Connect a source with a number column to plot.</p>{/if}
  {/snippet}
  {#snippet footer()}<button class="button primary" onclick={closeModal}>Done</button>{/snippet}
  <Modal title={chart.title} subtitle="Chart" wide close={closeModal} children={content} {footer} />
{/if}
{#if confirmation}<ConfirmDialog request={confirmation} close={() => confirmation = undefined} />{/if}
