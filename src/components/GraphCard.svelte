<script module lang="ts">
  import type { ResizeParams } from '@xyflow/svelte';
  import type { Block, Result } from '../lib/workspace';
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
    edit?: {
      active: boolean;
      toggle: () => void;
      patch: (patch: Partial<Block>) => void;
      paste: () => void;
      error: (message: string) => void;
      run?: () => void;
      inputs: Pick<Block, 'id' | 'title'>[];
      aliases: string[];
      connect: (id: string) => void;
    };
  };
</script>

<script lang="ts">
  import { Handle, NodeResizer, Position } from '@xyflow/svelte';
  import type { Node, NodeProps } from '@xyflow/svelte';
  import { Braces, ChartColumnIncreasing, CircleAlert, Folder, Maximize2, Minimize2, Plus, Table2 } from 'lucide-svelte';
  import { countLabel, chartSeries, tablePreview } from '../lib/format';
  import MiniChart from './MiniChart.svelte';
  import BlockName from './BlockName.svelte';
  import ResultGrid from './ResultGrid.svelte';
  import TableEditor from './TableEditor.svelte';

  let { data, selected }: NodeProps<Node<CardData>> = $props();
  const icons = { table: Table2, sql: Braces, chart: ChartColumnIncreasing, group: Folder };
  const labels = { table: 'Table', sql: 'SQL query', chart: 'Chart', group: 'Group' };
  let block = $derived(data.block);
  let expandable = $derived(block.kind === 'table' || block.kind === 'chart');
  let expanded = $derived((block.kind === 'table' || block.kind === 'chart') && Boolean(block.expanded));
  let Icon = $derived(icons[block.kind]);
  let series = $derived(block.kind === 'chart' ? chartSeries(block, data.result) : undefined);
  let codeLines = $derived(block.kind === 'sql' ? block.sql.trim().split('\n').slice(0, 6) : []);
  const sqlKeyword = /^(?:SELECT|FROM|WHERE|JOIN|AS|GROUP|BY|ORDER|LIMIT|SUM|WITH|AND|DESC|ASC|VALUES)$/i;
</script>

{#snippet connectInput()}
  {#if data.edit?.inputs.length}
    <label class="field">Connect input
      <select value="" onchange={(event) => {
        if (event.currentTarget.value) data.edit?.connect(event.currentTarget.value);
        event.currentTarget.value = '';
      }}>
        <option value="">Choose a source…</option>
        {#each data.edit.inputs as input (input.id)}<option value={input.id}>{input.title}</option>{/each}
      </select>
    </label>
  {/if}
{/snippet}

{#if block.kind === 'group'}
  <div class="group-card" class:selected>
    <div class="group-title"><Folder size={15} /><h3 aria-label={block.title}><BlockName title={block.title} rename={data.rename} /></h3></div>
  </div>
{:else}
  {#if expanded}
    <NodeResizer minWidth={260} minHeight={block.kind === 'chart' ? 228 : 170} lineClass="block-resize-edge" handleClass="block-resize-corner"
      onResizeEnd={(_event, bounds) => data.resize?.(bounds)} />
  {/if}
  <div class="graph-card {block.kind}" class:expanded class:selected class:related={Boolean(data.focusSide)}>
    {#if block.kind === 'sql' || block.kind === 'chart'}
      <Handle type="target" position={Position.Left} isConnectable={true} aria-label="Input port" />
    {/if}
    {#if block.kind === 'table' || block.kind === 'sql'}
      <Handle type="source" position={Position.Right} isConnectable={true} aria-label="Output port" />
      <Handle id="quick-create" class="quick-exit" type="source" position={Position.Right} isConnectable={true}
        isConnectableEnd={false} aria-label={'Drag to add a block from ' + block.title} title="Drag onto the canvas to add a connected block">
        <Plus size={15} />
      </Handle>
    {/if}
    <header class="node-heading">
      <span class="kind-icon {block.kind}"><Icon size={17} strokeWidth={1.85} /></span>
      <div><p>{labels[block.kind]}</p><h3 aria-label={block.title}><BlockName title={block.title} rename={data.rename} /></h3></div>
      {#if data.focusSide}<span class="node-relationship">{data.focusSide}</span>{/if}
      {#if expandable}
        <button class="icon-button small nodrag" aria-expanded={expanded}
          title={(expanded ? 'Collapse ' : 'Expand ') + block.kind}
          aria-label={(expanded ? 'Collapse ' : 'Expand ') + block.kind + ' ' + block.title}
          onclick={(event) => { event.stopPropagation(); data.toggleExpanded?.(); }}>
          {#if expanded}<Minimize2 size={14} />{:else}<Maximize2 size={14} />{/if}
        </button>
      {/if}
    </header>

    {#if data.edit?.active}
      {@const edit = data.edit}
      <div class="node-preview node-inline nodrag nopan nowheel" role="group" aria-label={'Edit ' + block.title}>
        {#if block.kind === 'table'}
          <TableEditor {block} change={edit.patch} paste={edit.paste} error={edit.error} />
        {:else if block.kind === 'sql'}
          <textarea class="sql-editor" aria-label="SQL code" spellcheck="false" value={block.sql}
            oninput={(event) => edit.patch({ sql: event.currentTarget.value })}></textarea>
          {@render connectInput()}
          {#if edit.aliases.length}<p class="helper-text">SQL inputs {#each edit.aliases as alias}<code>{alias}</code>{/each}</p>{/if}
        {:else}
          {@render connectInput()}
          <label class="field">Chart type<select value={block.chart}
            onchange={(event) => edit.patch({ chart: event.currentTarget.value === 'line' ? 'line' : 'bar' })}><option value="bar">Bar</option><option value="line">Line</option></select></label>
          {#if data.result}
            <label class="field">X axis<select value={block.x} onchange={(event) => edit.patch({ x: event.currentTarget.value })}>
              <option value="">Automatic</option>{#each data.result.columns as column}<option value={column.name}>{column.name}</option>{/each}
            </select></label>
            <label class="field">Y axis<select value={block.y} onchange={(event) => edit.patch({ y: event.currentTarget.value })}>
              <option value="">Automatic</option>{#each data.result.columns.filter((column) => column.type === 'decimal') as column}<option value={column.name}>{column.name}</option>{/each}
            </select></label>
          {/if}
        {/if}
      </div>
      <footer class="node-footer">
        {#if block.kind === 'sql'}
          <button class="nodrag" onclick={edit.run} disabled={data.dataState === 'running'}>{data.dataState === 'running' ? 'Running…' : 'Run query'}</button>
          {#if data.issue}<span class="node-state error" title={data.issue}>Query error</span>{/if}
        {:else}<span></span>{/if}
        <button class="nodrag" onclick={edit.toggle}>Done</button>
      </footer>
    {:else if block.kind === 'table'}
      <div class="node-preview node-table">
        {#if block.expanded}
          <ResultGrid full result={tablePreview(block, block.rows.length)} />
        {:else}
          <ResultGrid compact limit={4} result={tablePreview(block, 4)} />
        {/if}
      </div>
      <footer class="node-footer"><span>{countLabel(block.rows.length, 'row')} <span class="separator">·</span> {countLabel(block.columns.length, 'column')}</span>
        {#if data.issue}<span class="node-state error" title={data.issue}><CircleAlert size={12} /> Invalid data</span>{/if}
        <div class="node-actions">{#if data.edit}<button class="nodrag" onclick={data.edit.toggle}>Edit inline</button>{/if}<button class="nodrag" onclick={data.open}>Open table</button></div>
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
        <div class="node-actions">{#if data.edit}<button class="nodrag" onclick={data.edit.toggle}>Edit inline</button>{/if}<button class="nodrag" onclick={(event) => { event.stopPropagation(); data.open(); }}>Open query</button></div>
      </footer>
    {:else}
      <div class="node-preview node-chart">{#if series}
        <MiniChart {series} type={block.chart} dark={data.dark} compact={!expanded} />
      {:else}<div class="node-placeholder" title={data.issue}><ChartColumnIncreasing size={24} /><span>{data.dataState === 'running' ? 'Loading data…' : data.issue ? 'Fix source data' : 'Connect a data source'}</span></div>{/if}</div>
      <footer class="node-footer"><span>{block.chart === 'bar' ? 'Bar chart' : 'Line chart'}{#if series && (data.dataState === 'stale' || data.dataState === 'error')} <span class="inline-warning">· Previous data</span>{:else if series?.truncated} <span class="separator">·</span> First 100{/if}</span><div class="node-actions">{#if data.edit}<button class="nodrag" onclick={data.edit.toggle}>Edit inline</button>{/if}<button class="nodrag" onclick={data.open}>Open chart</button></div></footer>
    {/if}
  </div>
{/if}
