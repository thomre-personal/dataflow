<script lang="ts">
  import { Background, BackgroundVariant, MarkerType, MiniMap, SvelteFlow } from '@xyflow/svelte';
  import type { Connection, Edge, Node } from '@xyflow/svelte';
  import {
    ArrowDownLeft, ArrowRight, ArrowUpRight, Braces, ChartColumnIncreasing, Check,
    ChevronDown, CircleAlert, ClipboardPlus, CloudOff, Focus, Folder, Layers3, Link2, Maximize,
    Moon, PanelRightClose, PanelRightOpen, Play, Plus, Search, Sun, Table2, Trash2, Unplug,
    Workflow, X,
  } from 'lucide-svelte';
  import { onMount, tick } from 'svelte';
  import GraphCard from './components/GraphCard.svelte';
  import type { CardData } from './components/GraphCard.svelte';
  import CanvasControls from './components/CanvasControls.svelte';
  import type { FitCanvas } from './components/CanvasControls.svelte';
  import Modal from './components/Modal.svelte';
  import TableEditor from './components/TableEditor.svelte';
  import ResultGrid from './components/ResultGrid.svelte';
  import MiniChart from './components/MiniChart.svelte';
  import { absolutePosition, addLink, canConnect, canGroup, createBlock, createWorkspace, kinds, related, starterWorkspace } from './lib/workspace';
  import type { Block, BlockKind, ChartBlock, Library, NumberFormat, Result, SqlBlock, Workspace } from './lib/workspace';
  import { importGrid, parseDelimited } from './lib/clipboard';
  import { chartSeries, countLabel, tableResult } from './lib/format';
  import { loadLibrary, saveLibrary } from './lib/storage';

  const icons = { table: Table2, sql: Braces, chart: ChartColumnIncreasing, group: Folder };
  const blockKinds: BlockKind[] = ['table', 'sql', 'chart', 'group'];
  const addLabel = (kind: BlockKind) => 'Add ' + (kind === 'sql' ? 'SQL query' : kinds[kind].label.toLowerCase());
  const fitOptions = { padding: '5%' as const, maxZoom: 1.12 };
  const nodeTypes = { block: GraphCard };
  let requestFit: FitCanvas | undefined;
  const sample = starterWorkspace();
  let library = $state<Library>({ activeId: sample.id, workspaces: [sample] });
  let workspace = $derived(library.workspaces.find((item) => item.id === library.activeId) ?? library.workspaces[0]);
  let ready = $state(false);
  let selectedId = $state('monthly-totals');
  let selected = $derived(workspace.blocks.find((block) => block.id === selectedId));
  let inputLinks = $derived(workspace.links.filter((link) => link.target === selectedId));
  let outputLinks = $derived(workspace.links.filter((link) => link.source === selectedId));
  let panel = $state(true);
  let filter = $state('');
  let focused = $state('');
  let workspaceMenu = $state(false);
  let activeTab = $state<'sql' | 'data'>('sql');
  let modal = $state<'paste' | 'table' | 'search' | 'chart' | 'workspace' | null>(null);
  let workspaceTitle = $state('');
  let renamingWorkspace = $state(false);
  let pasteText = $state('');
  let pasteHeader = $state(true);
  let pasteNumberFormat = $state<NumberFormat>('auto');
  let pasteTarget = $state('');
  let pasteError = $state('');
  let search = $state('');
  let saveState = $state<'saving' | 'saved' | 'error'>('saved');
  let notice = $state('');
  let theme = $state<'light' | 'dark' | 'system'>('system');
  let systemDark = $state(false);
  let dark = $derived(theme === 'dark' || (theme === 'system' && systemDark));
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

  function replaceWorkspace(next: Workspace) {
    library = { ...library, workspaces: library.workspaces.map((item) => item.id === next.id ? next : item) };
    persist();
  }

  function invalidate(ids: Iterable<string>) {
    for (const id of ids) {
      stamps.set(id, (stamps.get(id) ?? 0) + 1);
      if (runtime[id]) runtime[id] = { ...runtime[id], state: 'stale', error: undefined };
    }
  }

  function patchBlock(id: string, patch: Partial<Block>) {
    const dataChange = 'sql' in patch || 'rows' in patch || 'columns' in patch || 'numberFormat' in patch;
    if (dataChange) invalidate([id, ...related(workspace, id, 'outputs')]);
    replaceWorkspace({ ...workspace, blocks: workspace.blocks.map((block) => block.id === id ? { ...block, ...patch } as Block : block) });
  }

  async function runSQL(block: SqlBlock, showResult = true) {
    if (runtime[block.id]?.state === 'running') return;
    const stamp = (stamps.get(block.id) ?? 0) + 1;
    stamps.set(block.id, stamp);
    const source = $state.snapshot(workspace) as Workspace;
    runtime[block.id] = { state: 'running', result: runtime[block.id]?.result };
    try {
      const { runQuery } = await import('./lib/sql');
      const result = await runQuery(source, block.id);
      if (stamps.get(block.id) !== stamp) return;
      runtime[block.id] = { state: 'ready', result };
      if (showResult && selectedId === block.id && library.activeId === source.id) activeTab = 'data';
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
    try {
      const stored = localStorage.getItem('dataflow-theme');
      if (stored === 'light' || stored === 'dark') theme = stored;
    } catch { /* Use the system preference when browser storage is unavailable. */ }
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
      try { localStorage.setItem('dataflow-theme', theme); } catch { /* A theme can still be applied for this tab. */ }
    }
  });

  function chartInput(block: ChartBlock): { result?: Result; state?: 'ready' | 'stale' | 'running' | 'error' } {
    const link = workspace.links.find((item) => item.target === block.id);
    const source = workspace.blocks.find((item) => item.id === link?.source);
    if (source?.kind === 'table') return { result: tableResult(source), state: 'ready' };
    if (source?.kind === 'sql') return runtime[source.id] ?? {};
    return {};
  }

  $effect(() => {
    const inputs = focused ? related(workspace, focused, 'inputs') : new Set<string>();
    const outputs = focused ? related(workspace, focused, 'outputs') : new Set<string>();
    const focusPositions = new Map<string, { x: number; y: number }>();
    if (focused) {
      focusPositions.set(focused, { x: 0, y: 0 });
      for (const [x, side] of [[-350, inputs], [350, outputs]] as const) {
        [...side].forEach((id, index) => focusPositions.set(id, { x, y: (index - (side.size - 1) / 2) * 260 }));
      }
    }
    const depth = (block: Block) => {
      let count = 0;
      let current = block.parentId;
      const visited = new Set([block.id]);
      while (current && !visited.has(current)) {
        visited.add(current);
        count++;
        current = workspace.blocks.find((item) => item.id === current)?.parentId;
      }
      return count;
    };
    flowNodes = workspace.blocks.filter((block) => !focused || focusPositions.has(block.id)).sort((a, b) => depth(a) - depth(b)).map((block) => {
      const result = block.kind === 'chart' ? chartInput(block) : runtime[block.id] ?? {};
      const children = workspace.blocks.filter((item) => item.parentId === block.id);
      return {
        id: block.id, type: 'block', position: focusPositions.get(block.id) ?? { ...block.position }, parentId: focused ? undefined : block.parentId,
        selected: block.id === selectedId,
        dragHandle: block.kind === 'group' ? '.group-title' : '.node-heading',
        width: block.kind === 'group' ? Math.max(330, ...children.map((item) => item.position.x + 300)) : 260,
        ...(block.kind === 'group' ? { height: Math.max(280, ...children.map((item) => item.position.y + 260)), zIndex: depth(block) } : { zIndex: 10 + depth(block) }),
        ariaLabel: kinds[block.kind].label + ': ' + block.title,
        data: {
          block, result: result.result, dataState: result.state, dark,
          focusSide: inputs.has(block.id) ? 'input' : outputs.has(block.id) ? 'output' : undefined,
          open: () => openBlock(block.id),
        },
      };
    });
    flowEdges = workspace.links.filter((link) => !focused || (focusPositions.has(link.source) && focusPositions.has(link.target))).map((link) => ({
      ...link, type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: dark ? '#7185a1' : '#889cb6' },
      style: 'stroke-width: 1.8px; stroke: ' + (dark ? '#7185a1' : '#889cb6'),
    }));
  });

  function select(id: string) {
    if (id !== selectedId) activeTab = 'sql';
    selectedId = id;
    panel = true;
  }

  function openBlock(id: string) {
    select(id);
    const block = workspace.blocks.find((candidate) => candidate.id === id);
    if (block?.kind === 'table') modal = 'table';
    if (block?.kind === 'chart') modal = 'chart';
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

  function add(kind: BlockKind) {
    if (!ready) return;
    focused = '';
    const count = workspace.blocks.filter((block) => block.kind !== 'group').length;
    const block = createBlock(kind, { x: 44 + (count % 3) * 332, y: Math.floor(count / 3) * 280 + 166 });
    replaceWorkspace({ ...workspace, blocks: [...workspace.blocks, block] });
    select(block.id);
    if (kind === 'table') modal = 'table';
    void fitCanvas();
  }

  function connect(source: string, target: string) {
    const next = addLink(workspace, source, target);
    if (next === workspace) return;
    invalidate([target, ...related(workspace, target, 'outputs')]);
    replaceWorkspace(next);
  }

  function onConnect(connection: Connection) {
    connect(connection.source, connection.target);
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
    const parent = group ? absolutePosition(group, workspace.blocks) : { x: 0, y: 0 };
    const siblings = workspace.blocks.filter((item) => item.parentId === groupId && item.id !== block.id);
    const absolute = absolutePosition(block, workspace.blocks);
    const position = group ? { x: 24, y: 55 + siblings.length * 260 } : { x: absolute.x - parent.x, y: absolute.y - parent.y };
    patchBlock(block.id, { parentId: group?.id, position });
  }

  function removeBlock(block: Block) {
    if (!confirm('Delete “' + block.title + '” from this workspace?')) return;
    invalidate([block.id, ...related(workspace, block.id, 'outputs')]);
    replaceWorkspace({
      ...workspace,
      blocks: workspace.blocks.filter((item) => item.id !== block.id).map((item) =>
        item.parentId === block.id ? { ...item, parentId: block.parentId, position: { x: item.position.x + block.position.x, y: item.position.y + block.position.y } } : item),
      links: workspace.links.filter((link) => link.source !== block.id && link.target !== block.id),
    });
    selectedId = '';
    if (focused === block.id) focused = '';
    modal = null;
  }

  function switchWorkspace(id: string) {
    library = { ...library, activeId: id };
    workspaceMenu = false;
    focused = '';
    filter = '';
    selectedId = workspace.blocks[0]?.id ?? '';
    activeTab = 'sql';
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
    pasteText = '';
    pasteError = '';
    pasteHeader = true;
    pasteNumberFormat = 'auto';
    pasteTarget = id;
    modal = 'paste';
  }

  function importPaste() {
    try {
      const data = importGrid(parseDelimited(pasteText), pasteHeader, pasteNumberFormat);
      const target = workspace.blocks.find((item) => item.id === pasteTarget);
      if (target?.kind === 'table') {
        if (target.rows.some((row) => row.cells.some((cell) => cell.trim())) && !confirm('Replace the existing data in “' + target.title + '”?')) return;
        patchBlock(target.id, { ...data, numberFormat: pasteNumberFormat });
        modal = 'table';
      } else {
        const count = workspace.blocks.filter((block) => block.kind !== 'group').length;
        const block: Block = {
          ...createBlock('table', { x: 44 + (count % 3) * 332, y: Math.floor(count / 3) * 280 + 166 }),
          kind: 'table', ...data, title: 'Pasted data', numberFormat: pasteNumberFormat, style: 'banded',
        };
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

  function closeModal() { modal = modal === 'paste' && pasteTarget ? 'table' : null; }
  function openSearch() { search = ''; modal = 'search'; }
  function keyboard(event: KeyboardEvent) {
    const withModifier = event.metaKey || event.ctrlKey;
    if (withModifier && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
    if (withModifier && event.key === 'Enter' && selected?.kind === 'sql' && !modal) {
      event.preventDefault();
      void runSQL(selected);
    }
  }

  let selectedChart = $derived(selected?.kind === 'chart' ? chartInput(selected) : {});
  let selectedSeries = $derived(selected?.kind === 'chart' ? chartSeries(selected, selectedChart.result) : undefined);
  let searchResults = $derived(workspace.blocks.filter((block) => (block.title + ' ' + kinds[block.kind].label).toLowerCase().includes(search.trim().toLowerCase())));
  let candidates = $derived(selected ? workspace.blocks.filter((block) => canConnect(workspace, block.id, selected!.id)) : []);
</script>

<svelte:window onkeydown={keyboard} />

<div class="app-shell">
  <header class="app-header">
    <div class="header-brand"><div class="brand-mark"><Workflow size={21} strokeWidth={2} /></div><span>DataFlow</span></div>
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
    <div class="header-right">
      <span class="save-state" title="Stored in this browser">{#if saveState === 'error'}<CircleAlert size={15} /> Could not save{:else if saveState === 'saving'}<span class="save-dot"></span> Saving…{:else}<CloudOff size={15} /> Saved locally{/if}</span>
      <button class="header-search" onclick={openSearch} aria-label="Find a block"><Search size={16} /><span>Find a block</span><kbd>⌘ K</kbd></button>
      <button class="icon-button theme-toggle" aria-label={dark ? 'Use light mode' : 'Use dark mode'} title={dark ? 'Use light mode' : 'Use dark mode'} onclick={() => theme = dark ? 'light' : 'dark'}>{#if dark}<Sun size={18} />{:else}<Moon size={18} />{/if}</button>
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
            <button class="button ghost compact-button" aria-label={addLabel(kind)} title={addLabel(kind)} onclick={() => add(kind)}><Icon size={16} /><span>{kind === 'sql' ? 'SQL' : kinds[kind].label}</span></button>
          {/each}
          <span class="action-divider"></span>
          <button class="button primary compact-button" aria-label="Paste data" onclick={() => openPaste()}><ClipboardPlus size={15} /><span>Paste data</span></button>
          {#if selected && !panel}<button class="icon-button" aria-label="Open inspector" onclick={() => panel = true}><PanelRightOpen size={18} /></button>{/if}
        </div>
      </div>
      <div class="canvas-stage">
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
            onconnect={onConnect}
            isValidConnection={({ source, target }) => canConnect(workspace, source, target)}
            onnodeclick={({ node }) => select(node.id)}
            onnodedragstop={({ targetNode }) => { if (targetNode) patchBlock(targetNode.id, { position: { ...targetNode.position } }); }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={19} size={1.1} patternColor={dark ? '#46526a' : '#c7d2e0'} />
            <MiniMap nodeColor={(node) => {
              const kind = (node.data as CardData).block.kind;
              return kind === 'sql' ? '#a697f0' : kind === 'chart' ? '#69beaf' : kind === 'group' ? '#9da9ba' : '#94aff9';
            }} height={88} width={144} maskColor={dark ? '#111827a0' : '#edf2f8af'} pannable zoomable />
            <CanvasControls connect={(fit) => { requestFit = fit; void fitCanvas(); }} fit={() => void fitCanvas()} />
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
        <div class="inspector-scroll">
          {#if block.kind === 'sql'}
            <div class="tabs" aria-label="Query views"><button class:active={activeTab === 'sql'} onclick={() => activeTab = 'sql'}>SQL</button><button class:active={activeTab === 'data'} onclick={() => activeTab = 'data'}>Data</button></div>
            <div class="inspector-body">
              {#if activeTab === 'sql'}
                <label class="control-label" for="sql-editor">Query</label>
                <textarea id="sql-editor" class="sql-editor" spellcheck="false" value={block.sql} oninput={(event) => patchBlock(block.id, { sql: event.currentTarget.value })}></textarea>
              {:else if runtime[block.id]?.result}
                {@const result = runtime[block.id].result!}
                <div class="result-summary"><span>{countLabel(result.rows.length, 'row')}</span>{#if runtime[block.id].state !== 'ready'}<span class="inline-warning">Previous result</span>{/if}</div>
                <ResultGrid {result} />
                {#if result.rows.length > 8}<p class="helper-text">Showing the first 8 rows.</p>{/if}
              {:else}
                <p class="inspector-empty">Run the query to see its result.</p>
              {/if}
              {#if runtime[block.id]?.error}<p class="inline-error" role="alert"><CircleAlert size={15} />{runtime[block.id].error}</p>{/if}
              <button class="button primary run-button" onclick={() => void runSQL(block)} disabled={runtime[block.id]?.state === 'running'}><Play size={14} fill="currentColor" /> {runtime[block.id]?.state === 'running' ? 'Running…' : 'Run query'}<kbd>⌘ ↵</kbd></button>
            </div>
          {:else if block.kind === 'table'}
            <div class="inspector-body">
              <div class="result-summary"><span>{countLabel(block.rows.length, 'row')} <span class="separator">·</span> {countLabel(block.columns.length, 'column')}</span></div>
              <ResultGrid result={tableResult(block)} limit={5} />
              <button class="button primary full-width" onclick={() => modal = 'table'}><Table2 size={15} /> Edit table</button>
            </div>
          {:else if block.kind === 'chart'}
            <div class="inspector-body">
              {#if selectedChart.state && selectedChart.state !== 'ready'}<p class="inline-warning">{selectedChart.state === 'running' ? 'Refreshing data…' : 'Source result may be out of date'}</p>{/if}
              {#if selectedSeries}<div class="inspector-chart"><MiniChart series={selectedSeries} type={block.chart} {dark} compact /></div>{/if}
              <label class="field">Chart type<select value={block.chart} onchange={(event) => patchBlock(block.id, { chart: event.currentTarget.value as ChartBlock['chart'] })}><option value="bar">Bar</option><option value="line">Line</option></select></label>
              {#if selectedChart.result}
                <label class="field">X axis<select value={block.x} onchange={(event) => patchBlock(block.id, { x: event.currentTarget.value })}><option value="">Automatic</option>{#each selectedChart.result.columns as column}<option value={column.name}>{column.name}</option>{/each}</select></label>
                <label class="field">Y axis<select value={block.y} onchange={(event) => patchBlock(block.id, { y: event.currentTarget.value })}><option value="">Automatic</option>{#each selectedChart.result.columns.filter((column) => column.type === 'decimal') as column}<option value={column.name}>{column.name}</option>{/each}</select></label>
              {/if}
              {#if selectedSeries}<button class="button secondary full-width" onclick={() => modal = 'chart'}><Maximize size={15} /> Open chart</button>{/if}
            </div>
          {:else}
            <div class="inspector-body"><p class="helper-text">{countLabel(workspace.blocks.filter((item) => item.parentId === block.id).length, 'block')} in this group</p></div>
          {/if}

          {#if block.kind !== 'group'}
            <section class="inspector-section" aria-label="Block connections">
              {#if block.kind !== 'table'}
                <div class="section-title"><ArrowDownLeft size={15} /><h3>Inputs</h3><span>{inputLinks.length}</span></div>
                {#each inputLinks as link (link.id)}
                  {@const input = workspace.blocks.find((item) => item.id === link.source)}
                  <div class="connection-row"><button class="connection-link" onclick={() => focusBlock(link.source)}><Link2 size={14} /><span>{input?.title ?? 'Source'}</span></button><button class="icon-button small" aria-label={'Disconnect ' + (input?.title ?? 'source')} onclick={() => disconnect(link.id)}><Unplug size={13} /></button></div>
                  {#if block.kind === 'sql'}<code class="connection-alias">{link.alias}</code>{/if}
                {/each}
                {#if candidates.length}<select aria-label="Connect input" class="inline-select" value="" onchange={(event) => { const id = event.currentTarget.value; if (id) connect(id, block.id); event.currentTarget.value = ''; }}><option value="">Connect input…</option>{#each candidates as item}<option value={item.id}>{item.title}</option>{/each}</select>
                {:else if inputLinks.length === 0}<p class="helper-text">Add a table or query to connect it.</p>{/if}
              {/if}
              {#if block.kind !== 'chart'}
                <div class="section-title" class:spaced={block.kind === 'sql'}><ArrowUpRight size={15} /><h3>Outputs</h3><span>{outputLinks.length}</span></div>
                {#each outputLinks as link (link.id)}
                  <button class="connection-row connection-link" onclick={() => focusBlock(link.target)}><Link2 size={14} /><span>{workspace.blocks.find((item) => item.id === link.target)?.title ?? 'Target'}</span></button>
                {/each}
                {#if outputLinks.length === 0}<p class="helper-text">No connected outputs</p>{/if}
              {/if}
            </section>
          {/if}

          <section class="inspector-section block-settings" aria-label="Block settings">
            <label class="field">Name<input value={block.title} onchange={(event) => patchBlock(block.id, { title: event.currentTarget.value.trim() || block.title })} /></label>
            {#if workspace.blocks.some((item) => canGroup(block, item, workspace.blocks))}
              <label class="field">Group<select value={block.parentId ?? ''} onchange={(event) => moveToGroup(block, event.currentTarget.value)}><option value="">None</option>{#each workspace.blocks.filter((item) => canGroup(block, item, workspace.blocks)) as item}<option value={item.id}>{item.title}</option>{/each}</select></label>
            {/if}
            <div class="inspector-buttons"><button class="button ghost" onclick={() => focusBlock(block.id)}><Focus size={15} /> Focus</button><button class="icon-button" aria-label={'Delete ' + block.title} onclick={() => removeBlock(block)}><Trash2 size={15} /></button></div>
          </section>
        </div>
      </aside>
    {/if}
  </div>

  {#if notice}<div class="toast" role="status"><Check size={15} /><span>{notice}</span><button class="icon-button small" aria-label="Dismiss message" onclick={() => notice = ''}><X size={14} /></button></div>{/if}
</div>

{#if modal === 'search'}
  {#snippet content()}
    <label class="search-field"><Search size={19} /><input aria-label="Search by block name" placeholder="Search by block name…" bind:value={search} onkeydown={(event) => { if (event.key === 'Enter' && searchResults[0]) focusBlock(searchResults[0].id); }} /></label>
    <div class="search-results">
      {#each searchResults as block (block.id)}
        {@const Icon = icons[block.kind]}
        <button onclick={() => focusBlock(block.id)}><span class="kind-icon {block.kind}"><Icon size={16} /></span><span>{block.title}<small>{kinds[block.kind].label}</small></span><ArrowRight size={16} /></button>
      {:else}<p class="inspector-empty">No matching blocks.</p>{/each}
    </div>
  {/snippet}
  <Modal title="Find a block" close={closeModal} children={content} />
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
    <TableEditor block={table} change={(patch) => patchBlock(table.id, patch)} paste={() => openPaste(table.id)} error={message} />
  {/snippet}
  {#snippet footer()}<button class="button primary" onclick={closeModal}>Done</button>{/snippet}
  <Modal title={table.title} subtitle="Table" wide close={closeModal} children={content} {footer} />
{:else if modal === 'chart' && selected?.kind === 'chart'}
  {@const chart = selected}
  {#snippet content()}
    {#if selectedSeries}<div class="expanded-chart"><MiniChart series={selectedSeries} type={chart.chart} {dark} /></div>
      {#if selectedSeries.truncated}<p class="helper-text">Showing the first 100 rows.</p>{/if}
    {:else}<p class="inspector-empty">Connect a source with a number column to plot.</p>{/if}
  {/snippet}
  <Modal title={chart.title} subtitle={chart.chart === 'bar' ? 'Bar chart' : 'Line chart'} wide close={closeModal} children={content} />
{/if}
