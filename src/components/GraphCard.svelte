<script module lang="ts">
  import type { ResizeParams } from '@xyflow/svelte';
  import type { Block, Result, TableBlock, Workspace } from '../lib/workspace';
  import type { Hotkeys } from '../lib/preferences';
  import type { CellAddress, CellSelection } from '../lib/cell-style';
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
    canResize?: (bounds: ResizeParams) => boolean;
    group?: { count: number; drop: { target: string }; focused: boolean; focusExpanded: boolean; hasInput: boolean; hasOutput: boolean };
    edit?: {
      workspace: Workspace;
      toggleLock: () => void;
      patch: (patch: Partial<TableBlock>) => void;
      hotkeys: Hotkeys;
      paste: () => void;
      error: (message: string) => void;
      activeCell?: CellSelection;
      selectCell: (cell: CellAddress, extend?: boolean) => void;
    };
  };
</script>

<script lang="ts">
  import { Handle, NodeResizer, Position, useConnection } from '@xyflow/svelte';
  import type { Node, NodeProps } from '@xyflow/svelte';
  import { Braces, ChartColumnIncreasing, CircleAlert, Folder, Lock, LockOpen, Maximize2, Minimize2, Plus, Table2 } from 'lucide-svelte';
  import { countLabel, chartSeries, tablePreview } from '../lib/format';
  import { canConnect } from '../lib/workspace';
  import { tableCardContentSize } from '../lib/table-layout';
  import MiniChart from './MiniChart.svelte';
  import BlockName from './BlockName.svelte';
  import ResultGrid from './ResultGrid.svelte';
  import TableEditor from './TableEditor.svelte';

  let { data, selected }: NodeProps<Node<CardData>> = $props();
  const connection = useConnection();
  const icons = { table: Table2, sql: Braces, chart: ChartColumnIncreasing, group: Folder };
  const labels = { table: 'Table', sql: 'SQL query', chart: 'Chart', group: 'Group' };
  let block = $derived(data.block);
  let expanded = $derived(block.kind !== 'sql' && (block.expanded !== false || data.group?.focusExpanded === true));
  let connectionSource = $derived(connection.current.fromHandle?.type === 'source' ? connection.current.fromNode?.id : undefined);
  let acceptsConnection = $derived(block.kind === 'table' && data.edit && connectionSource
    && canConnect(data.edit.workspace, connectionSource, block.id));
  let Icon = $derived(icons[block.kind]);
  let series = $derived(block.kind === 'chart' ? chartSeries(block, data.result) : undefined);
  let codeLines = $derived(block.kind === 'sql' ? block.sql.trim().split('\n').slice(0, 6) : []);
  let card = $state<HTMLDivElement>();
  let movedResize = false;
  const sqlKeyword = /^(?:SELECT|FROM|WHERE|JOIN|AS|GROUP|BY|ORDER|LIMIT|SUM|WITH|AND|DESC|ASC|VALUES)$/i;

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
      const height = top || handle.classList.contains('bottom') ? size.height : element.offsetHeight;
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

{#snippet expansionButton()}
  <button class="icon-button small nodrag" aria-expanded={expanded}
    title={(expanded ? 'Collapse ' : 'Expand ') + block.kind}
    aria-label={(expanded ? 'Collapse ' : 'Expand ') + block.kind + ' ' + block.title}
    onclick={(event) => { event.stopPropagation(); data.toggleExpanded?.(); }}>
    {#if expanded}<Minimize2 size={14} />{:else}<Maximize2 size={14} />{/if}
  </button>
{/snippet}

{#if expanded && !data.group?.focusExpanded}
  <NodeResizer minWidth={260} minHeight={block.kind === 'chart' ? 228 : block.kind === 'group' ? 120 : 170}
    lineClass="block-resize-edge" handleClass="block-resize-corner"
    shouldResize={(_event, bounds) => data.canResize?.(bounds) ?? true}
    onResizeStart={() => movedResize = false} onResize={() => movedResize = true}
    onResizeEnd={(_event, bounds) => { if (movedResize) data.resize?.(bounds); }} />
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
    {#if block.kind === 'table' || block.kind === 'sql' || block.kind === 'chart'}
      <Handle type="target" position={Position.Left} isConnectable={true} aria-label="Input port" />
    {/if}
    {#if block.kind === 'table' || block.kind === 'sql'}
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
      {#if block.kind !== 'sql'}{@render expansionButton()}{/if}
    </header>

    {#if block.kind === 'table'}
      {#if expanded && !block.inlineLocked && data.edit}
        <div class="node-preview node-inline nodrag nopan nowheel" role="group" aria-label={'Edit ' + block.title}>
          <TableEditor {block} workspace={data.edit.workspace} hotkeys={data.edit.hotkeys} change={data.edit.patch}
            paste={data.edit.paste} error={data.edit.error} activeCell={data.edit.activeCell} selectCell={data.edit.selectCell} inline />
        </div>
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
              aria-label={block.inlineLocked ? 'Unlock inline editing' : 'Lock inline editing'} onclick={data.edit.toggleLock}>
              {#if block.inlineLocked}<LockOpen size={12} /> Unlock{:else}<Lock size={12} /> Lock{/if}
            </button>
          {/if}
          <button class="nodrag" onclick={data.open}>Open table</button>
        </div>
      </footer>
    {:else if block.kind === 'sql'}
      <div class="node-preview node-code" aria-hidden="true">
        {#each codeLines as line, index}
          <div><span class="line-number">{index + 1}</span><code>{#each line.split(/(\b\w+\b)/) as token}<span class:keyword={sqlKeyword.test(token)}>{token}</span>{/each}</code></div>
        {/each}
        {#if !codeLines.length}<div><span class="line-number">1</span><code class="muted-text">-- Write a query</code></div>{/if}
      </div>
      <footer class="node-footer">
        <span class="node-state {data.dataState ?? ''}"><i></i>{data.dataState === 'ready' ? countLabel(data.result?.rows.length ?? 0, 'result row') : data.dataState === 'running' ? 'Running…' : data.dataState === 'stale' ? 'Needs run' : data.dataState === 'error' ? 'Query error' : 'SQL'}</span>
        <button class="nodrag" onclick={(event) => { event.stopPropagation(); data.open(); }}>Open query</button>
      </footer>
    {:else}
      <div class="node-preview node-chart">{#if series}
        <MiniChart {series} type={block.chart} dark={data.dark} compact={!expanded} />
      {:else}<div class="node-placeholder" title={data.issue}><ChartColumnIncreasing size={24} /><span>{data.dataState === 'running' ? 'Loading data…' : data.issue ? 'Fix source data' : 'Connect a data source'}</span></div>{/if}</div>
      <footer class="node-footer"><span>{block.chart === 'bar' ? 'Bar chart' : 'Line chart'}{#if series && (data.dataState === 'stale' || data.dataState === 'error')} <span class="inline-warning">· Previous data</span>{:else if series?.truncated} <span class="separator">·</span> First 100{/if}</span><button class="nodrag" onclick={data.open}>Open chart</button></footer>
    {/if}
  </div>
{/if}
