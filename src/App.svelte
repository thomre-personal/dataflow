<script lang="ts">
  import { Background, BackgroundVariant, MarkerType, MiniMap, SvelteFlow } from '@xyflow/svelte';
  import type { Connection, Edge, Node, OnConnectEnd, ResizeParams } from '@xyflow/svelte';
  import {
    ArrowDownLeft, ArrowUpRight, Braces, ChartColumnIncreasing, Check,
    ChevronDown, CircleAlert, ClipboardPlus, CloudOff, Focus, Folder, Layers3, Link2, Maximize,
    PanelRightClose, PanelRightOpen, Pencil, Play, Plus, Redo2, Search, Settings as SettingsIcon, Table2, Trash2, Undo2, Unplug,
    Workflow, X,
  } from 'lucide-svelte';
  import { onMount, tick, untrack } from 'svelte';
  import GraphCard from './components/GraphCard.svelte';
  import type { CardData } from './components/GraphCard.svelte';
  import BlockSearch from './components/BlockSearch.svelte';
  import CanvasControls from './components/CanvasControls.svelte';
  import type { CanvasPosition, FitCanvas } from './components/CanvasControls.svelte';
  import Modal from './components/Modal.svelte';
  import TableEditor from './components/TableEditor.svelte';
  import type { CellAddress } from './components/TableEditor.svelte';
  import CellInspector from './components/CellInspector.svelte';
  import ResultGrid from './components/ResultGrid.svelte';
  import MiniChart from './components/MiniChart.svelte';
  import Settings from './components/Settings.svelte';
  import { absolutePosition, addLink, canConnect, canGroup, columnLetter, createBlock, createWorkspace, kinds, related, rowNumber, sqlAlias, starterWorkspace, tableInputs } from './lib/workspace';
  import type { Block, BlockKind, ChartBlock, GroupBlock, Library, Link, NumberFormat, Position, Result, SqlBlock, Workspace } from './lib/workspace';
  import { importGrid, parseDelimited } from './lib/clipboard';
  import { bindTableFormulas, cellFormulaText, isFormulaEntry } from './lib/formulas';
  import { describeCellIssue, invalidTableCells, tableData } from './lib/table-data';
  import { chartSeries, countLabel, tablePreview, tableResult } from './lib/format';
  import { loadLibrary, saveLibrary } from './lib/storage';
  import { defaultHotkeys, defaultPreferences, eventHotkey, hotkeyLabel, isMac, loadPreferences } from './lib/preferences';
  import type { Preferences } from './lib/preferences';

  const icons = { table: Table2, sql: Braces, chart: ChartColumnIncreasing, group: Folder };
  const blockKinds: BlockKind[] = ['table', 'sql', 'chart', 'group'];
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
  let activeCell = $state<(CellAddress & { tableId: string })>();
  let inspectorScroll = $state<HTMLDivElement>();
  let selectedTableCell = $derived.by(() => {
    if (selected?.kind !== 'table' || activeCell?.tableId !== selected.id) return;
    const { rowId, columnId } = activeCell;
    const row = selected.rows.findIndex(({ id }) => id === rowId);
    const column = selected.columns.findIndex(({ id }) => id === columnId);
    if (row < 0 || column < 0) return;
    const letter = columnLetter(column);
    const name = selected.columns[column].name;
    const text = cellFormulaText(selected.rows[row], selected.columns, column, tableInputs(workspace, selected.id));
    return {
      address: letter + rowNumber(selected, row),
      column: name === letter ? undefined : name,
      formula: isFormulaEntry(text) ? text : '',
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
  let modal = $state<'paste' | 'table' | 'sql' | 'chart' | 'workspace' | 'settings' | 'quick-create' | 'configure' | null>(null);
  let quickSource = $state('');
  let quickPosition = $state<Position>({ x: 0, y: 0 });
  let quickPointer = $state<Position>({ x: 0, y: 0 });
  let draftBlock = $state<SqlBlock | ChartBlock | undefined>();
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
  let notice = $state('');
  let preferences = $state<Preferences>(defaultPreferences);
  let systemDark = $state(false);
  let dark = $derived(preferences.theme === 'dark' || (preferences.theme === 'auto' && systemDark));
  let flowNodes = $state.raw<Node<CardData>[]>([]);
  let flowEdges = $state.raw<Edge[]>([]);
  let runtime = $state<Record<string, { state: 'ready' | 'stale' | 'running' | 'error'; result?: Result; error?: string }>>({});
  const stamps = new Map<string, number>();
  let saveWork = Promise.resolve();
  let saveSequence = 0;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  function message(text: string) {
    notice = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice = ''; }, 4200);
  }

  function persist() {
    if (!ready) return;
    const snapshot = $state.snapshot(library) as Library;
    const sequence = ++saveSequence;
    saveState = 'saving';
    saveWork = saveWork.catch(() => {}).then(() => saveLibrary(snapshot));
    void saveWork.then(() => {
      if (sequence === saveSequence) saveState = 'saved';
    }, () => {
      if (sequence === saveSequence) saveState = 'error';
    });
  }

  function saveWorkspace(next: Workspace) {
    library = { ...library, workspaces: library.workspaces.map((item) => item.id === next.id ? next : item) };
    persist();
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

    const before = new Map(workspace.blocks.map((block) => [block.id, block]));
    const after = new Map(next.blocks.map((block) => [block.id, block]));
    const nextLinks = new Set(next.links.map((link) => link.id));
    const currentLinks = new Set(workspace.links.map((link) => link.id));
    const affected = new Set([
      ...workspace.links.filter((link) => !nextLinks.has(link.id)).map((link) => link.target),
      ...next.links.filter((link) => !currentLinks.has(link.id)).map((link) => link.target),
    ]);
    for (const [id, previous] of before) {
      const block = after.get(id);
      if (!block || (block.kind === 'sql' && previous.kind === 'sql' && block.sql !== previous.sql)
        || (block.kind === 'table' && previous.kind === 'table'
          && (block.rows !== previous.rows || block.columns !== previous.columns || block.numberFormat !== previous.numberFormat
            || block.footerRows !== previous.footerRows))) affected.add(id);
    }
    for (const id of [...affected]) {
      for (const downstream of related(next, id, 'outputs')) affected.add(downstream);
    }
    invalidate(affected);

    saveWorkspace(next);
    if (!after.has(focused)) focused = '';
    if (entry.selectedId !== selectedId) {
      selectedId = entry.selectedId;
      activeCell = undefined;
      showQueryTab('sql');
    }
    initializeQueries(next);
  }

  function invalidate(ids: Iterable<string>) {
    for (const id of ids) {
      stamps.set(id, (stamps.get(id) ?? 0) + 1);
      if (runtime[id]) runtime[id] = { ...runtime[id], state: 'stale', error: undefined };
    }
  }

  function patchBlock(id: string, patch: Partial<Block>) {
    if (!workspace.blocks.some((block) => block.id === id)) return;
    const dataChange = 'sql' in patch || 'rows' in patch || 'columns' in patch || 'numberFormat' in patch || 'footerRows' in patch;
    if (dataChange) invalidate([id, ...related(workspace, id, 'outputs')]);
    replaceWorkspace({ ...workspace, blocks: workspace.blocks.map((block) => block.id === id ? { ...block, ...patch } as Block : block) });
  }

  function renameBlock(id: string, value: string) {
    const block = workspace.blocks.find((item) => item.id === id);
    const title = value.trim();
    if (block && title && title !== block.title) patchBlock(id, { title });
    return title || block?.title || '';
  }

  async function runSQL(block: SqlBlock, showResult = true) {
    if (runtime[block.id]?.state === 'running') return;
    const stamp = (stamps.get(block.id) ?? 0) + 1;
    stamps.set(block.id, stamp);
    const source = $state.snapshot(workspace) as Workspace;
    const viewRevision = queryViewRevision;
    runtime[block.id] = { state: 'running', result: runtime[block.id]?.result };
    try {
      const { runQuery } = await import('./lib/sql');
      const result = await runQuery(source, block.id);
      if (stamps.get(block.id) !== stamp) return;
      runtime[block.id] = { state: 'ready', result };
      if (showResult && viewRevision === queryViewRevision && selectedId === block.id && library.activeId === source.id) activeTab = 'data';
    } catch (error) {
      if (stamps.get(block.id) !== stamp) return;
      runtime[block.id] = { state: 'error', result: runtime[block.id]?.result, error: error instanceof Error ? error.message : String(error) };
    }
  }

  function initializeQueries(current: Workspace) {
    for (const group of current.blocks) {
      if (group.kind === 'sql' && !runtime[group.id]) void runSQL(group, false);
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
        }
        ready = true;
        if (!restored) persist();
      } catch {
        ready = true;
        saveState = 'error';
      }
      initializeQueries(workspace);
    })();
    return () => {
      preference.removeEventListener('change', changed);
      clearTimeout(noticeTimer);
    };
  });

  $effect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (ready) {
      try { localStorage.setItem('dataflow-preferences', JSON.stringify(preferences)); } catch { /* Keep this tab usable without browser storage. */ }
    }
  });

  function chartInput(block: ChartBlock): { result?: Result; state?: 'ready' | 'stale' | 'running' | 'error'; error?: string } {
    const link = workspace.links.find((item) => item.target === block.id);
    const source = workspace.blocks.find((item) => item.id === link?.source);
    if (source?.kind === 'table') {
      try { return { result: tableResult(source, workspace), state: 'ready' }; }
      catch (error) { return { state: 'error', error: error instanceof Error ? error.message : String(error) }; }
    }
    if (source?.kind === 'sql') return runtime[source.id] ?? {};
    return {};
  }

  function tableProblem(block: Block) {
    if (block.kind !== 'table') return undefined;
    const issue = invalidTableCells(block, tableData(block, workspace)).next().value;
    return issue ? describeCellIssue(block, issue) : undefined;
  }

  function nodeSize(block: Block, focusScope?: ReadonlySet<string>): { width: number; height: number } {
    if ((block.kind === 'table' || block.kind === 'chart') && block.expanded !== false) {
      if (block.expandedSize) return block.expandedSize;
      if (block.kind === 'chart') return { width: 420, height: 320 };
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
            selectCell: (cell: CellAddress) => select(block.id, cell),
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

  function select(id: string, cell?: CellAddress) {
    if (flowEdges.some((edge) => edge.selected)) {
      flowEdges = flowEdges.map((edge) => edge.selected ? { ...edge, selected: false } : edge);
    }
    if (id !== selectedId) showQueryTab('sql');
    selectedId = id;
    activeCell = cell ? { tableId: id, ...cell } : undefined;
    panel = true;
  }

  function openBlock(id: string) {
    select(id);
    const block = workspace.blocks.find((candidate) => candidate.id === id);
    if (block?.kind === 'table') modal = 'table';
    if (block?.kind === 'chart') modal = 'chart';
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
      invalidate([query.id, ...related(workspace, query.id, 'outputs')]);
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
    if (kind === 'sql' || kind === 'chart' || (kind === 'table' && !dropPosition)) openBlock(block.id);
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
    invalidate([target, ...related(workspace, target, 'outputs')]);
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
    quickPointer = { x: Math.max(8, Math.min(pointer.clientX, innerWidth - 256)), y: Math.max(8, Math.min(pointer.clientY, innerHeight - 140)) };
    modal = 'quick-create';
    await tick();
    quickFirstButton?.focus();
  };

  function configureNewBlock(kind: 'sql' | 'chart') {
    const source = workspace.blocks.find((block) => block.id === quickSource);
    if (!source) return closeModal();
    const group = groupAtPoint(quickPosition);
    const created = createBlock(kind, group ? groupPosition(quickPosition, group) : quickPosition);
    created.parentId = group?.id;
    if (created.kind !== 'sql' && created.kind !== 'chart') return;
    draftBlock = created.kind === 'sql'
      ? { ...created, title: source.title + ' query', sql: 'SELECT *\nFROM "' + sqlAlias(source.title) + '";' }
      : { ...created, title: source.title + ' chart' };
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
    invalidate([link.target, ...related(workspace, link.target, 'outputs')]);
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
    if (confirmDelete && !confirm('Delete “' + block.title + '” from this workspace?')) return;
    invalidate([block.id, ...related(workspace, block.id, 'outputs')]);
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

  function switchWorkspace(id: string) {
    library = { ...library, activeId: id };
    workspaceMenu = false;
    focused = '';
    filter = '';
    activeCell = undefined;
    selectedId = workspace.blocks[0]?.id ?? '';
    showQueryTab('sql');
    persist();
    initializeQueries(workspace);
    void fitCanvas();
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

  function importPaste() {
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
        if (hasValues && !confirm('Replace the existing data in “' + target.title + '”?')) return;
        patchBlock(target.id, {
          ...data, numberFormat: pasteNumberFormat,
          titleColumns: Math.min(target.titleColumns ?? 0, data.columns.length),
          footerRows: Math.min(target.footerRows ?? 0, data.rows.length),
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
    if (event.key === 'Escape' && modal === 'quick-create') closeModal();
    if (event.defaultPrevented || event.isComposing || modal) return;
    const shortcut = eventHotkey(event);
    if (!shortcut) return;
    const { hotkeys } = preferences;
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
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return;
    if (shortcut === hotkeys.undo || shortcut === hotkeys.redo
      || (shortcut === 'Mod+Y' && !isMac() && hotkeys.redo === defaultHotkeys.redo && !Object.values(hotkeys).includes(shortcut))) {
      event.preventDefault();
      stepHistory(shortcut === hotkeys.undo ? 'undo' : 'redo');
    }
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

<svelte:window onkeydown={keyboard} onkeydowncapture={queryShortcut} />

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
              <button class:current={library.activeId === item.id} onclick={() => switchWorkspace(item.id)}><Layers3 size={15} /><span>{item.title}</span>{#if library.activeId === item.id}<Check size={14} />{/if}</button>
            {/each}
            <button onclick={() => workspaceDialog(true)}><Layers3 size={15} /> Rename workspace</button>
            <button class="new-workspace" onclick={() => workspaceDialog()}><Plus size={15} /> New workspace</button>
          </div>
        {/if}
      </div>
    </div>
    {#key workspace.id}
      <BlockSearch bind:this={blockSearch} blocks={workspace.blocks} {icons} shortcut={hotkeyLabel(preferences.hotkeys.search)} onPick={focusBlock} />
    {/key}
    <div class="header-right">
      <span class="save-state" title="Stored in this browser">{#if saveState === 'error'}<CircleAlert size={15} /> Could not save{:else if saveState === 'saving'}<span class="save-dot"></span> Saving…{:else}<CloudOff size={15} /> Saved locally{/if}</span>
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
              if (!(event.target instanceof Element && event.target.matches('[data-table-cell]'))) select(node.id);
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
              <CellInspector {...selectedTableCell} clear={() => activeCell = undefined} />
            {/if}
            <div class="inspector-body">
              <div class="result-summary"><span>{countLabel(block.rows.length, 'row')} <span class="separator">·</span> {countLabel(block.columns.length, 'column')}</span></div>
              <ResultGrid result={tablePreview(block, 5, workspace)} limit={5} />
              {#if issue}<p class="inline-error"><CircleAlert size={15} />{issue}</p>{/if}
              <button class="button primary full-width" onclick={() => modal = 'table'}><Table2 size={15} /> Edit table</button>
            </div>
          {:else if block.kind === 'chart'}
            <div class="inspector-body">
              {#if selectedChart.error}<p class="inline-error" role="alert"><CircleAlert size={15} />{selectedChart.error}</p>
              {:else if selectedChart.state && selectedChart.state !== 'ready'}<p class="inline-warning">{selectedChart.state === 'running' ? 'Refreshing data…' : 'Source result may be out of date'}</p>{/if}
              {#if selectedSeries}<div class="inspector-chart"><MiniChart series={selectedSeries} type={block.chart} {dark} compact /></div>{/if}
              <button class="button secondary full-width" onclick={() => openBlock(block.id)}><Maximize size={15} /> Open chart</button>
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
                {:else if block.kind === 'table'}<code class="connection-alias">{link.alias}::…</code>{/if}
              {/each}
              {#if candidates.length}<select aria-label="Connect input" class="inline-select" value="" onchange={(event) => { const id = event.currentTarget.value; if (id) connect(id, block.id); event.currentTarget.value = ''; }}><option value="">Connect input…</option>{#each candidates as item}<option value={item.id}>{item.title}</option>{/each}</select>
              {:else if inputLinks.length === 0}<p class="helper-text">{block.kind === 'table' ? 'Connect a table to reference its columns.' : 'Add a table or query to connect it.'}</p>{/if}
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
    <div class="quick-picker" role="group" aria-label="Add connected block" style:left={quickPointer.x + 'px'} style:top={quickPointer.y + 'px'}>
      <p>Connect from <strong>{quickInput?.title}</strong></p>
      <button bind:this={quickFirstButton} onclick={() => configureNewBlock('sql')}><span class="kind-icon sql"><Braces size={16} /></span><span>SQL query<small>Filter or calculate</small></span></button>
      <button onclick={() => configureNewBlock('chart')}><span class="kind-icon chart"><ChartColumnIncreasing size={16} /></span><span>Chart<small>Plot the source data</small></span></button>
    </div>
  </div>
{:else if modal === 'configure' && draftBlock}
  {@const draft = draftBlock}
  {#snippet content()}
    <label class="field">Name<input maxlength="100" bind:value={draft.title} /></label>
    {#if draft.kind === 'sql'}
      {@render sqlCode(draft.sql, (text) => draft.sql = text)}
    {:else}
      <label class="field">Chart type<select bind:value={draft.chart}><option value="bar">Bar</option><option value="line">Line</option></select></label>
      {#if quickColumns.length}
        <label class="field">X axis<select bind:value={draft.x}><option value="">Automatic</option>{#each quickColumns as column}<option value={column.name}>{column.name}</option>{/each}</select></label>
        <label class="field">Y axis<select bind:value={draft.y}><option value="">Automatic</option>{#each quickColumns.filter((column) => column.type === 'decimal') as column}<option value={column.name}>{column.name}</option>{/each}</select></label>
      {/if}
    {/if}
  {/snippet}
  {#snippet footer()}
    <button class="button secondary" onclick={closeModal}>Cancel</button>
    <button class="button primary" onclick={createConnectedBlock} disabled={!draft.title.trim() || (draft.kind === 'sql' && !draft.sql.trim())}>{draft.kind === 'sql' ? 'Create SQL query' : 'Create chart'}</button>
  {/snippet}
  <Modal title={draft.kind === 'sql' ? 'Configure SQL query' : 'Configure chart'} subtitle={'Input: ' + (quickInput?.title ?? '')} wide={draft.kind === 'sql'} close={closeModal} children={content} {footer} />
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
{:else if modal === 'workspace'}
  {#snippet content()}
    <label class="field">Workspace name<input maxlength="100" bind:value={workspaceTitle} placeholder="e.g. Home budget" onkeydown={(event) => { if (event.key === 'Enter') saveWorkspaceName(); }} /></label>
  {/snippet}
  {#snippet footer()}<button class="button secondary" onclick={closeModal}>Cancel</button><button class="button primary" onclick={saveWorkspaceName} disabled={!workspaceTitle.trim()}>{renamingWorkspace ? 'Save name' : 'Create workspace'}</button>{/snippet}
  <Modal title={renamingWorkspace ? 'Rename workspace' : 'New workspace'} close={closeModal} children={content} {footer} />
{:else if modal === 'paste'}
  {#snippet content()}
    <label class="field">Cell range<textarea class="paste-editor" placeholder={'Date\tCategory\tAmount\n2026-01-01\tGroceries\t24.50'} bind:value={pasteText} spellcheck="false"></textarea></label>
    <div class="paste-options"><label class="checkbox"><input type="checkbox" bind:checked={pasteHeader} /> First row contains headers</label>
    <label class="field">Number format<select bind:value={pasteNumberFormat}><option value="auto">Detect automatically</option><option value="decimal-comma">1.234,56</option><option value="decimal-point">1,234.56</option></select></label></div>
    {#if pasteError}<p class="inline-error" role="alert"><CircleAlert size={15} />{pasteError}</p>{/if}
  {/snippet}
  {#snippet footer()}<button class="button secondary" onclick={closeModal}>Cancel</button><button class="button primary" onclick={importPaste} disabled={!pasteText.trim()}><ClipboardPlus size={15} /> {pasteTarget ? 'Replace table data' : 'Create table'}</button>{/snippet}
  <Modal title="Paste data" subtitle="Copy a cell range in Numbers or Excel and paste it below." close={closeModal} children={content} {footer} />
{:else if modal === 'table' && selected?.kind === 'table'}
  {@const table = selected}
  {#snippet content()}
    <div class="table-dialog-layout">
      <div class="table-dialog-editor">
        <TableEditor block={table} {workspace} hotkeys={preferences.hotkeys} change={(patch) => patchBlock(table.id, patch)}
          paste={() => openPaste(table.id)} error={message} activeCell={activeCell} selectCell={(cell) => select(table.id, cell)} />
      </div>
      <aside class="table-dialog-inspector" aria-label="Cell inspector">
        {#if selectedTableCell}
          <CellInspector {...selectedTableCell} clear={() => activeCell = undefined} />
        {:else}
          <p class="helper-text">Select a cell to see its functions.</p>
        {/if}
      </aside>
    </div>
  {/snippet}
  {#snippet footer()}<button class="button primary" onclick={closeModal}>Done</button>{/snippet}
  <Modal title={table.title} subtitle="Table" wide close={closeModal} children={content} {footer} />
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
