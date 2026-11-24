<script module lang="ts">
  import type { Block, Result } from '../lib/workspace';
  export type CardData = Record<string, unknown> & {
    block: Block;
    result?: Result;
    issue?: string;
    dark: boolean;
    dataState?: 'ready' | 'stale' | 'running' | 'error';
    focusSide?: 'input' | 'output';
    open: () => void;
    toggleTable?: () => void;
  };
</script>

<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';
  import type { Node, NodeProps } from '@xyflow/svelte';
  import { Braces, ChartColumnIncreasing, CircleAlert, Folder, Maximize2, Minimize2, Plus, Table2 } from 'lucide-svelte';
  import { countLabel, chartSeries, tablePreview } from '../lib/format';
  import MiniChart from './MiniChart.svelte';
  import ResultGrid from './ResultGrid.svelte';

  let { data, selected }: NodeProps<Node<CardData>> = $props();
  const icons = { table: Table2, sql: Braces, chart: ChartColumnIncreasing, group: Folder };
  const labels = { table: 'Table', sql: 'SQL query', chart: 'Chart', group: 'Group' };
  let block = $derived(data.block);
  let Icon = $derived(icons[block.kind]);
  let series = $derived(block.kind === 'chart' ? chartSeries(block, data.result) : undefined);
  let codeLines = $derived(block.kind === 'sql' ? block.sql.trim().split('\n').slice(0, 6) : []);
  const sqlKeyword = /^(?:SELECT|FROM|WHERE|JOIN|AS|GROUP|BY|ORDER|LIMIT|SUM|WITH|AND|DESC|ASC|VALUES)$/i;
</script>

{#if block.kind === 'group'}
  <div class="group-card" class:selected>
    <div class="group-title"><Folder size={15} /><span>{block.title}</span></div>
  </div>
{:else}
  <div class="graph-card {block.kind}" class:expanded={block.kind === 'table' && block.expanded} class:selected class:related={Boolean(data.focusSide)}>
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
      <div><p>{labels[block.kind]}</p><h3>{block.title}</h3></div>
      {#if data.focusSide}<span class="node-relationship">{data.focusSide}</span>{/if}
      {#if block.kind === 'table'}
        <button class="icon-button small nodrag" aria-expanded={Boolean(block.expanded)}
          title={block.expanded ? 'Collapse table' : 'Show full table on canvas'}
          aria-label={(block.expanded ? 'Collapse table ' : 'Expand table ') + block.title}
          onclick={(event) => { event.stopPropagation(); data.toggleTable?.(); }}>
          {#if block.expanded}<Minimize2 size={14} />{:else}<Maximize2 size={14} />{/if}
        </button>
      {/if}
    </header>

    {#if block.kind === 'table'}
      <div class="node-preview node-table">
        {#if block.expanded}
          <ResultGrid full result={tablePreview(block, block.rows.length)} />
        {:else}
          <ResultGrid compact limit={4} result={tablePreview(block, 4)} />
        {/if}
      </div>
      <footer class="node-footer"><span>{countLabel(block.rows.length, 'row')} <span class="separator">·</span> {countLabel(block.columns.length, 'column')}</span>
        {#if data.issue}<span class="node-state error" title={data.issue}><CircleAlert size={12} /> Invalid data</span>{/if}
        <button class="nodrag" onclick={data.open}>Open table</button></footer>
    {:else if block.kind === 'sql'}
      <div class="node-preview node-code" aria-hidden="true">
        {#each codeLines as line, index}
          <div><span class="line-number">{index + 1}</span><code>{#each line.split(/(\b\w+\b)/) as token}<span class:keyword={sqlKeyword.test(token)}>{token}</span>{/each}</code></div>
        {/each}
        {#if !codeLines.length}<div><span class="line-number">1</span><code class="muted-text">-- Write a query</code></div>{/if}
      </div>
      <footer class="node-footer">
        <span class="node-state {data.dataState ?? ''}"><i></i>{data.dataState === 'ready' ? countLabel(data.result?.rows.length ?? 0, 'result row') : data.dataState === 'running' ? 'Running…' : data.dataState === 'stale' ? 'Needs run' : data.dataState === 'error' ? 'Query error' : 'SQL'}</span>
        <button class="nodrag" onclick={data.open}>Open query</button>
      </footer>
    {:else}
      <div class="node-preview node-chart">{#if series}
        <MiniChart {series} type={block.chart} dark={data.dark} compact />
      {:else}<div class="node-placeholder" title={data.issue}><ChartColumnIncreasing size={24} /><span>{data.dataState === 'running' ? 'Loading data…' : data.issue ? 'Fix source data' : 'Connect a data source'}</span></div>{/if}</div>
      <footer class="node-footer"><span>{block.chart === 'bar' ? 'Bar chart' : 'Line chart'}{#if series && (data.dataState === 'stale' || data.dataState === 'error')} <span class="inline-warning">· Previous data</span>{:else if series?.truncated} <span class="separator">·</span> First 100{/if}</span><button class="nodrag" onclick={data.open}>Open chart</button></footer>
    {/if}
  </div>
{/if}
