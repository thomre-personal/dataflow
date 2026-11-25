<script module lang="ts">
  import type { ResizeParams } from '@xyflow/svelte';
  import type { Block, ConfigBlock, Result, SqlBlock, TableBlock, Workspace } from '../lib/workspace';
  import type { Hotkeys } from '../lib/preferences';
  import type { CellSelection } from '../lib/cell-style';
  import type { Confirmation } from './ConfirmDialog.svelte';
  export type CardData = Record<string, unknown> & {
    block: Block;
    result?: Result;
    issue?: string;
    dark: boolean;
    dataState?: 'ready' | 'stale' | 'running' | 'error';
    focusSide?: 'input' | 'output';
    open: () => void;
    rename: (title: string) => void;
    toggleExpanded?: () => void;
    resize?: (bounds: ResizeParams) => void;
    limitHeight?: (height: number | undefined) => void;
    canResize?: (bounds: ResizeParams) => boolean;
    query?: { setPreview: (view: NonNullable<SqlBlock['preview']>) => void; run: () => void };
    config?: { patch: (patch: Partial<ConfigBlock>) => void; confirm: (request: Confirmation) => void };
    switch?: { ready: boolean; toggle: () => void };
    group?: { count: number; drop: { target: string }; focused: boolean; focusExpanded: boolean; hasInput: boolean; hasOutput: boolean };
    edit?: {
      workspace: Workspace;
      toggleLock: () => void;
      patch: (patch: Partial<TableBlock>, continueGrowth?: boolean) => void;
      previewWidth: (width: number | undefined) => void;
      hotkeys: Hotkeys;
      error: (message: string) => void;
      activeCell?: CellSelection;
      selectCell: (cell: CellSelection, extend?: boolean) => void;
    };
  };
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { Handle, NodeResizer, Position, useConnection } from '@xyflow/svelte';
  import type { Node, NodeProps } from '@xyflow/svelte';
  import { Braces, ChartColumnIncreasing, CircleAlert, Equal, Folder, Lock, LockOpen, Maximize2, Minimize2, Pause, Plus, SlidersHorizontal, Table2, ToggleLeft } from 'lucide-svelte';
  import { countLabel, chartSeries, tablePreview } from '../lib/format';
  import { canConnect, defaultTableColumnWidth } from '../lib/workspace';
  import { cardContentHeight, tableCardContentSize } from '../lib/table-layout';
  import MiniChart from './MiniChart.svelte';
  import BlockName from './BlockName.svelte';
  import ResultGrid from './ResultGrid.svelte';
  import TableEditor from './TableEditor.svelte';
  import ConfigEditor from './ConfigEditor.svelte';

  let { data, selected }: NodeProps<Node<CardData>> = $props();
  const connection = useConnection();
  const icons = { table: Table2, sql: Braces, chart: ChartColumnIncreasing, config: SlidersHorizontal, switch: ToggleLeft, group: Folder };
  const labels = { table: 'Table', sql: 'SQL query', chart: 'Chart', config: 'Config', switch: 'Switch', group: 'Group' };
  let block = $derived(data.block);
  let expanded = $derived(block.kind !== 'sql' && block.kind !== 'switch'
    && (block.expanded !== false || data.group?.focusExpanded === true));
  let connectionSource = $derived(connection.current.fromHandle?.type === 'source' ? connection.current.fromNode?.id : undefined);
  let acceptsConnection = $derived(block.kind === 'table' && data.edit && connectionSource
    && canConnect(data.edit.workspace, connectionSource, block.id));
  let Icon = $derived(icons[block.kind]);
  let chartResult = $derived(data.result);
  let dark = $derived(data.dark);
  let series = $derived(block.kind === 'chart' ? chartSeries(block, chartResult) : undefined);
  let codeLines = $derived(block.kind === 'sql' ? block.sql.trim().split('\n').slice(0, 6) : []);
  let showQueryResults = $derived(block.kind === 'sql' && block.preview === 'results');
  let card = $state<HTMLDivElement>();
  let previewArea = $state<HTMLDivElement>();
  let fitsContentHeight = $derived(block.kind === 'config' || (block.kind === 'table' && Boolean(block.footerRows)));
  let contentHeightLimit = $state<number>();
  type GrowthAxis = 'row' | 'column';
  let tableEditor = $state<{
    startHandleResize: (axis: GrowthAxis) => void;
    resizeFromHandle: (offset: number) => void;
    finishHandleResize: () => void;
    revealRows: () => void;
  }>();
  let growth: { axis: GrowthAxis; pointer: number; start: number; step: number } | undefined;
  let skipGrowthClick = false;
  let movedResize = false;
  let resizeLimit = $state<{ width?: number; height: number }>();
  const sqlKeyword = /^(?:SELECT|FROM|WHERE|JOIN|AS|GROUP|BY|ORDER|LIMIT|SUM|WITH|AND|DESC|ASC|VALUES)$/i;

  function startGrowth(event: PointerEvent & { currentTarget: HTMLButtonElement }, axis: GrowthAxis) {
    if (event.button !== 0 || !card) return;
    const scale = card.getBoundingClientRect().width / card.offsetWidth;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    tableEditor?.startHandleResize(axis);
    skipGrowthClick = false;
    growth = { axis, pointer: event.pointerId, start: axis === 'row' ? event.clientY : event.clientX,
      step: scale * (axis === 'row' ? 33 : defaultTableColumnWidth) };
  }

  function moveGrowth(event: PointerEvent) {
    if (growth?.pointer !== event.pointerId) return;
    const distance = (growth.axis === 'row' ? event.clientY : event.clientX) - growth.start;
    if (growth.step <= 0) return;
    const magnitude = Math.abs(distance);
    const offset = magnitude <= 4 ? 0 : Math.sign(distance) * (Math.floor(magnitude / growth.step) + 1);
    if (offset) skipGrowthClick = true;
    tableEditor?.resizeFromHandle(offset);
  }

  function stopGrowth(event: PointerEvent) {
    if (growth?.pointer !== event.pointerId) return;
    if (event.type === 'pointerup') moveGrowth(event);
    growth = undefined;
    tableEditor?.finishHandleResize();
  }

  function startResize() {
    movedResize = false;
    resizeLimit = undefined;
    if (!card) return;
    if (block.kind === 'table') {
      const fit = tableCardContentSize(card);
      if (fit) resizeLimit = { width: Math.max(card.offsetWidth, fit.width),
        height: Math.max(card.offsetHeight, contentHeightLimit ?? fit.height) };
    } else if (contentHeightLimit !== undefined) {
      resizeLimit = { height: Math.max(card.offsetHeight, contentHeightLimit) };
    }
  }

  $effect(() => {
    if (!fitsContentHeight || !expanded || !card || !previewArea) return;
    const element = card;
    const preview = previewArea;
    const content = preview.querySelector<HTMLElement>('.table-editor-content, .config-editor');
    const limitHeight = untrack(() => data.limitHeight);
    if (!content || !limitHeight) return;
    const observer = new ResizeObserver(() => {
      const height = cardContentHeight(element, preview, content.offsetHeight);
      contentHeightLimit = height;
      limitHeight(height);
    });
    observer.observe(content);
    observer.observe(preview);
    return () => {
      observer.disconnect();
      contentHeightLimit = undefined;
      limitHeight(undefined);
    };
  });

  $effect(() => {
    if (block.kind !== 'table' || !expanded || !card) return;
    const element = card;
    const node = element.parentElement;
    function fitEdge(event: MouseEvent) {
      const handle = event.target instanceof Element && event.target.closest('.block-resize-edge, .block-resize-corner');
      if (!handle || handle.parentElement !== node) return;
      const size = tableCardContentSize(element);
      if (!size) return;
      const left = handle.classList.contains('left');
      const top = handle.classList.contains('top');
      const width = left || handle.classList.contains('right') ? size.width : element.offsetWidth;
      const height = top || handle.classList.contains('bottom') ? contentHeightLimit ?? size.height : element.offsetHeight;
      if (width === element.offsetWidth && height === element.offsetHeight) return;
      event.stopPropagation();
      data.resize?.({
        width, height,
        x: block.position.x + (left ? element.offsetWidth - width : 0),
        y: block.position.y + (top ? element.offsetHeight - height : 0),
      });
    }
    node?.addEventListener('dblclick', fitEdge);
    return () => node?.removeEventListener('dblclick', fitEdge);
  });
</script>

{#snippet growthHandle(axis: GrowthAxis)}
  <button type="button" class="table-grow nodrag nopan" class:table-grow-row={axis === 'row'}
    aria-label={'Add ' + axis} title={'Click to add one ' + axis + '. Drag out to add or in to remove empty ' + axis + 's.'}
    onpointerdown={(event) => startGrowth(event, axis)} onpointermove={moveGrowth} onpointerup={stopGrowth} onlostpointercapture={stopGrowth}
    onclick={(event) => {
      event.stopPropagation();
      if (event.detail === 0 || !skipGrowthClick) {
        tableEditor?.startHandleResize(axis);
        tableEditor?.resizeFromHandle(1);
        tableEditor?.finishHandleResize();
      }
      skipGrowthClick = false;
    }}>
    {#if axis === 'row'}<Equal size={15} />{:else}<Pause size={15} />{/if}
  </button>
{/snippet}

{#snippet expansionButton()}
  <button class="icon-button small nodrag" aria-expanded={expanded}
    title={(expanded ? 'Collapse ' : 'Expand ') + block.kind}
    aria-label={(expanded ? 'Collapse ' : 'Expand ') + block.kind + ' ' + block.title}
    onclick={(event) => { event.stopPropagation(); data.toggleExpanded?.(); }}>
    {#if expanded}<Minimize2 size={14} />{:else}<Maximize2 size={14} />{/if}
  </button>
{/snippet}

{#if expanded && !data.group?.focusExpanded}
  <NodeResizer minWidth={260} minHeight={block.kind === 'chart' ? 228 : block.kind === 'group' ? 120 : Math.min(170, contentHeightLimit ?? 170)}
    maxWidth={resizeLimit?.width} maxHeight={resizeLimit?.height}
    lineClass="block-resize-edge" handleClass="block-resize-corner"
    shouldResize={(_event, bounds) => data.canResize?.(bounds) ?? true}
    onResizeStart={startResize} onResize={() => movedResize = true}
    onResizeEnd={(_event, bounds) => {
      resizeLimit = undefined;
      if (movedResize) data.resize?.(bounds);
    }} />
{/if}

{#if block.kind === 'group'}
  <div class="group-card" class:selected class:focused={data.group?.focused} class:collapsed={!expanded} class:drop-target={data.group?.drop.target === block.id}>
    {#if data.group?.hasInput}<Handle type="target" position={Position.Left} isConnectable={false} class="group-proxy-port" />{/if}
    {#if data.group?.hasOutput}<Handle type="source" position={Position.Right} isConnectable={false} class="group-proxy-port" />{/if}
    <header class="group-title">
      <Folder size={15} />
      <div><h3 aria-label={block.title}><BlockName title={block.title} rename={data.rename} /></h3>
        {#if !expanded}<p>{countLabel(data.group?.count ?? 0, 'block')}</p>{/if}
      </div>
      {#if !data.group?.focusExpanded}{@render expansionButton()}{/if}
    </header>
  </div>
{:else}
  <div bind:this={card} class="graph-card {block.kind}" class:expanded class:selected class:related={Boolean(data.focusSide)} class:accepts-connection={Boolean(acceptsConnection)}>
    {#if block.kind === 'table' || block.kind === 'sql' || block.kind === 'chart' || block.kind === 'switch'}
      <Handle type="target" position={Position.Left} isConnectable={true} aria-label="Input port" />
    {/if}
    {#if block.kind === 'switch'}<Handle type="source" position={Position.Right} isConnectable={true} aria-label="Output port" />{/if}
    {#if block.kind === 'table' || block.kind === 'sql' || block.kind === 'config'}
      <Handle type="source" position={Position.Right} isConnectable={true} aria-label="Output port" />
      <Handle id="quick-create" class="quick-exit" type="source" position={Position.Right} isConnectable={true}
        isConnectableEnd={false} aria-label={'Connect or add a block from ' + block.title} title="Drag onto a table to connect, or onto the canvas to add a block">
        <Plus size={15} />
      </Handle>
    {/if}
    <header class="node-heading">
      <span class="kind-icon {block.kind}"><Icon size={17} strokeWidth={1.85} /></span>
      <div><p>{labels[block.kind]}</p><h3 aria-label={block.title}><BlockName title={block.title} rename={data.rename} /></h3></div>
      {#if data.focusSide}<span class="node-relationship">{data.focusSide}</span>{/if}
      {#if block.kind === 'sql'}
        <div class="node-query-toggle nodrag nopan" role="group" aria-label="SQL preview">
          <button type="button" aria-pressed={!showQueryResults}
            onclick={(event) => { event.stopPropagation(); data.query?.setPreview('query'); }}>SQL</button>
          <button type="button" aria-pressed={showQueryResults}
            onclick={(event) => { event.stopPropagation(); data.query?.setPreview('results'); }}>Results</button>
        </div>
      {:else if block.kind !== 'switch'}{@render expansionButton()}{/if}
    </header>

    {#if block.kind === 'table'}
      {#if expanded && data.edit}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (The locked table must be reachable for keyboard scrolling.) -->
        <div bind:this={previewArea} class="node-preview node-inline nodrag nopan nowheel" role={block.inlineLocked ? 'region' : 'group'}
          aria-label={block.inlineLocked ? 'Full table data' : 'Edit ' + block.title} data-table-style={block.style} tabindex={block.inlineLocked ? 0 : undefined}
          onscroll={(event) => {
            const element = event.currentTarget;
            if (element.scrollTop + element.clientHeight >= element.scrollHeight - 1) tableEditor?.revealRows();
          }}>
          <TableEditor bind:this={tableEditor} {block} workspace={data.edit.workspace} hotkeys={data.edit.hotkeys} change={data.edit.patch}
            previewWidth={data.edit.previewWidth}
            error={data.edit.error} activeCell={block.inlineLocked ? undefined : data.edit.activeCell}
            selectCell={data.edit.selectCell} locked={block.inlineLocked ?? false} inline />
        </div>
        {#if selected && !block.inlineLocked}{@render growthHandle('row')}{@render growthHandle('column')}{/if}
      {:else}
        <div class="node-preview node-table">
          {#if expanded}
            <ResultGrid full result={tablePreview(block, block.rows.length, data.edit?.workspace)} />
          {:else}
            <ResultGrid compact limit={4} result={tablePreview(block, 4, data.edit?.workspace)} />
          {/if}
        </div>
      {/if}
      <footer class="node-footer"><span>{countLabel(block.rows.length, 'row')} <span class="separator">·</span> {countLabel(block.columns.length, 'column')}</span>
        {#if data.issue}<span class="node-state error" title={data.issue}><CircleAlert size={12} /> Invalid data</span>{/if}
        <div class="node-actions">
          {#if expanded && data.edit}
            <button class="nodrag" title={block.inlineLocked ? 'Unlock inline editing' : 'Lock inline editing'}
              aria-label={block.inlineLocked ? 'Unlock inline editing' : 'Lock inline editing'}
              onclick={(event) => { event.stopPropagation(); data.edit?.toggleLock(); }}>
              {#if block.inlineLocked}<LockOpen size={12} /> Unlock{:else}<Lock size={12} /> Lock{/if}
            </button>
          {/if}
          <button class="nodrag" onclick={data.open}>Open table</button>
        </div>
      </footer>
    {:else if block.kind === 'sql'}
      {#if showQueryResults}
        <div class="node-preview node-table">
          {#if data.result}
            <ResultGrid full result={data.result} label="Query results" />
          {:else}
            <p class="node-placeholder" title={data.issue}>
              {data.dataState === 'running' ? 'Running query…' : data.dataState === 'error' ? 'Query failed.' : 'Run the query to see results.'}
            </p>
          {/if}
        </div>
      {:else}
        <div class="node-preview node-code" aria-hidden="true">
          {#each codeLines as line, index}
            <div><span class="line-number">{index + 1}</span><code>{#each line.split(/(\b\w+\b)/) as token}<span class:keyword={sqlKeyword.test(token)}>{token}</span>{/each}</code></div>
          {/each}
          {#if !codeLines.length}<div><span class="line-number">1</span><code class="muted-text">-- Write a query</code></div>{/if}
        </div>
      {/if}
      <footer class="node-footer">
        <span class="node-state {data.dataState ?? ''}" title={data.issue}><i></i>{data.dataState === 'ready' ? countLabel(data.result?.rows.length ?? 0, 'result row') : data.dataState === 'running' ? 'Running…' : data.dataState === 'stale' ? 'Needs run' : data.dataState === 'error' ? 'Query error' : 'SQL'}</span>
        <div class="node-actions">
          {#if showQueryResults}
            <button class="nodrag" aria-label="Run query" disabled={data.dataState === 'running'}
              onclick={(event) => { event.stopPropagation(); data.query?.run(); }}>Run</button>
          {/if}
          <button class="nodrag" onclick={(event) => { event.stopPropagation(); data.open(); }}>Open query</button>
        </div>
      </footer>
    {:else if block.kind === 'config'}
      <div bind:this={previewArea} class="node-preview node-inline nodrag nopan nowheel">
        {#if expanded && data.config}
          <ConfigEditor {block} change={data.config.patch} confirm={data.config.confirm} />
        {:else}
          <p class="helper-text">{countLabel(block.presets.length, 'preset')}</p>
        {/if}
      </div>
      <footer class="node-footer"><span>{countLabel(block.fields.length, 'field')}{#if block.global} <span class="separator">·</span> Global{/if}</span>
        <button class="nodrag" onclick={(event) => { event.stopPropagation(); data.open(); }}>Open config</button>
      </footer>
    {:else if block.kind === 'switch'}
      {@const target = block.options[block.active === 0 ? 1 : 0].label}
      <div class="node-preview node-switch">
        <button class="button primary nodrag" disabled={!data.switch?.ready} onclick={(event) => {
          event.stopPropagation();
          data.switch?.toggle();
        }}>{block.active === undefined ? 'Apply ' : 'Switch to '}{target}</button>
        {#if block.active !== undefined}<span>Last applied {block.options[block.active].label}</span>
        {:else if !data.switch?.ready}<span>Choose presets for both options.</span>{/if}
      </div>
      <footer class="node-footer"><button class="nodrag" onclick={(event) => { event.stopPropagation(); data.open(); }}>Configure switch</button></footer>
    {:else}
      <div class="node-preview node-chart">{#if series}
        <MiniChart {series} type={block.chart} {dark} compact={!expanded} />
      {:else}<div class="node-placeholder" title={data.issue}><ChartColumnIncreasing size={24} /><span>{data.dataState === 'running' ? 'Loading data…' : data.issue ? 'Fix source data' : 'Connect a data source'}</span></div>{/if}</div>
      <footer class="node-footer"><span>{block.chart === 'bar' ? 'Bar chart' : 'Line chart'}{#if series && (data.dataState === 'stale' || data.dataState === 'error')} <span class="inline-warning">· Previous data</span>{:else if series?.truncated} <span class="separator">·</span> First 100{/if}</span><button class="nodrag" onclick={data.open}>Open chart</button></footer>
    {/if}
  </div>
{/if}
