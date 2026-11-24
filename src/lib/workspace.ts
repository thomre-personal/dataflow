export type BlockKind = 'table' | 'sql' | 'chart' | 'group';
export type ValueType = 'text' | 'decimal' | 'date' | 'boolean';
export type ColumnType = ValueType | 'auto';
export type NumberFormat = 'auto' | 'decimal-comma' | 'decimal-point';
export type TableStyle = 'plain' | 'banded' | 'emphasis' | 'grid';
export type Position = { x: number; y: number };

export type Column = { id: string; name: string; type: ColumnType };
export type FormulaColumn = { columnId: string; reference: 'implicit' | 'name' | 'letter' };
export type OrderedFunction = 'MIN' | 'MAX' | 'MEDIAN';
export type Formula =
  | { name: 'SUM' | 'AVERAGE' | 'AVG' | OrderedFunction; source: FormulaColumn }
  | { name: 'COUNT'; source: FormulaColumn; distinct?: boolean }
  | { name: 'SUMIF'; condition: FormulaColumn; criterion: string; source?: FormulaColumn }
  | { name: 'COUNTIF'; condition: FormulaColumn; criterion: string }
  | { name: 'CONCAT'; parts: (FormulaColumn | { literal: string } | { expression: Formula })[] };
// Earlier workspaces stored SUM as a column reference without a function name.
export type Row = { id: string; cells: string[]; formulas?: Record<string, Formula | FormulaColumn> };
type BlockBase = { id: string; title: string; position: Position; parentId?: string };
type ExpandableBlock = { expanded?: boolean; expandedSize?: { width: number; height: number } };

export type TableBlock = BlockBase & ExpandableBlock & {
  kind: 'table';
  columns: Column[];
  rows: Row[];
  numberFormat: NumberFormat;
  style: TableStyle;
  inlineLocked?: boolean;
  titleColumns?: number;
  footerRows?: number;
  rowIndexBase?: 0 | 1;
};
export type SqlBlock = BlockBase & { kind: 'sql'; sql: string };
export type ChartBlock = BlockBase & ExpandableBlock & { kind: 'chart'; chart: 'bar' | 'line'; x: string; y: string };
export type GroupBlock = BlockBase & ExpandableBlock & { kind: 'group' };
export type Block = TableBlock | SqlBlock | ChartBlock | GroupBlock;
export type Link = { id: string; source: string; target: string; alias: string };
export type Workspace = {
  id: string;
  title: string;
  sample?: boolean;
  blocks: Block[];
  links: Link[];
};
export type Library = { activeId: string; workspaces: Workspace[] };
export type Result = {
  columns: { name: string; type: ValueType }[];
  rows: (string | null)[][];
  titleColumns?: number;
  footerRows?: number;
};

export function dataRowCount(table: TableBlock) {
  return Math.max(0, table.rows.length - (table.footerRows ?? 0));
}

export function columnLetter(index: number): string {
  let label = '';
  for (let position = index + 1; position > 0; position = Math.floor((position - 1) / 26)) {
    label = String.fromCharCode(65 + (position - 1) % 26) + label;
  }
  return label;
}

export function rowNumber(table: TableBlock, index: number) {
  return index + (table.rowIndexBase ?? 1);
}

export const kinds = {
  table: { label: 'Table', plural: 'Tables' },
  sql: { label: 'SQL query', plural: 'SQL queries' },
  chart: { label: 'Chart', plural: 'Charts' },
  group: { label: 'Group', plural: 'Groups' },
} satisfies Record<BlockKind, { label: string; plural: string }>;

export const newId = () => crypto.randomUUID();

export function createWorkspace(title: string): Workspace {
  return { id: newId(), title, blocks: [], links: [] };
}

export function createBlock(kind: BlockKind, position: Position): Block {
  const base = { id: newId(), position, title: 'Untitled ' + (kind === 'sql' ? 'SQL query' : kinds[kind].label.toLowerCase()) };
  switch (kind) {
    case 'table':
      return { ...base, kind, columns: [{ id: newId(), name: 'A', type: 'auto' }], rows: [{ id: newId(), cells: [''] }], numberFormat: 'auto', style: 'banded' };
    case 'sql':
      return { ...base, kind, sql: 'SELECT 42 AS value;' };
    case 'chart':
      return { ...base, kind, chart: 'bar', x: '', y: '' };
    case 'group':
      return { ...base, kind };
  }
}

export function sqlAlias(title: string): string {
  const name = title.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[a-z]/.test(name) ? name : 'input' + (name ? '_' + name : '');
}

export function related(workspace: Workspace, id: string, direction: 'inputs' | 'outputs'): Set<string> {
  const found = new Set<string>();
  const pending = [id];
  while (pending.length) {
    const current = pending.pop()!;
    for (const link of workspace.links) {
      const parent = direction === 'inputs' ? link.target : link.source;
      const child = direction === 'inputs' ? link.source : link.target;
      if (parent === current && !found.has(child) && child !== id) {
        found.add(child);
        pending.push(child);
      }
    }
  }
  return found;
}

export function canConnect(workspace: Workspace, source: string, target: string): boolean {
  const from = workspace.blocks.find((block) => block.id === source);
  const to = workspace.blocks.find((block) => block.id === target);
  return Boolean(from && to && source !== target
    && (from.kind === 'table' || from.kind === 'sql')
    && (to.kind === 'sql' || to.kind === 'chart')
    && !workspace.links.some((link) => link.source === source && link.target === target)
    && !related(workspace, target, 'outputs').has(source));
}

export function addLink(workspace: Workspace, source: string, target: string): Workspace {
  if (!canConnect(workspace, source, target)) return workspace;
  const from = workspace.blocks.find((block) => block.id === source)!;
  const to = workspace.blocks.find((block) => block.id === target)!;
  const links = workspace.links.filter((link) => to.kind !== 'chart' || link.target !== target);
  const used = new Set(links.filter((link) => link.target === target).map((link) => link.alias));
  const base = sqlAlias(from.title);
  let alias = base;
  for (let suffix = 2; used.has(alias); suffix++) alias = base + '_' + suffix;
  const next = [...links, { id: newId(), source, target, alias }];
  const blocks = to.kind === 'sql' && to.sql === 'SELECT 42 AS value;'
    ? workspace.blocks.map((block) => block.id === target ? { ...to, sql: 'SELECT *\nFROM "' + alias + '";' } : block)
    : workspace.blocks;
  return { ...workspace, blocks, links: next };
}

export function absolutePosition(block: Block, blocks: Block[]): Position {
  let x = block.position.x;
  let y = block.position.y;
  let parentId = block.parentId;
  const visited = new Set([block.id]);
  while (parentId && !visited.has(parentId)) {
    const parent = blocks.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    visited.add(parentId);
    x += parent.position.x;
    y += parent.position.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

export function canGroup(block: Block, group: Block, blocks: Block[]): boolean {
  if (group.kind !== 'group' || group.id === block.id) return false;
  let parent = group.parentId;
  const visited = new Set([group.id]);
  while (parent && !visited.has(parent)) {
    if (parent === block.id) return false;
    visited.add(parent);
    parent = blocks.find((candidate) => candidate.id === parent)?.parentId;
  }
  return true;
}

export function starterWorkspace(): Workspace {
  const table: TableBlock = {
    id: 'transactions', kind: 'table', title: 'Transactions', position: { x: 44, y: 166 },
    columns: [
      { id: 'date', name: 'Date', type: 'date' },
      { id: 'category', name: 'Category', type: 'text' },
      { id: 'amount', name: 'Amount', type: 'decimal' },
    ],
    numberFormat: 'auto', style: 'banded',
    rows: [
      ['2026-01-03', 'Housing', '850.00'], ['2026-01-08', 'Groceries', '126.40'],
      ['2026-01-12', 'Eating out', '54.80'], ['2026-01-17', 'Transport', '49.00'],
      ['2026-02-03', 'Housing', '850.00'], ['2026-02-07', 'Groceries', '152.30'],
      ['2026-02-11', 'Hobbies', '89.95'], ['2026-02-16', 'Transport', '49.00'],
      ['2026-03-03', 'Housing', '850.00'], ['2026-03-09', 'Groceries', '119.60'],
      ['2026-03-12', 'Eating out', '74.10'], ['2026-03-21', 'Transport', '49.00'],
    ].map((cells, i) => ({ id: 'txn-' + (i + 1), cells })),
  };
  const sql: SqlBlock = {
    id: 'monthly-totals', kind: 'sql', title: 'Monthly totals', position: { x: 376, y: 166 },
    sql: "SELECT\n  strftime(date, '%Y-%m') AS month,\n  sum(amount) AS total\nFROM transactions\nGROUP BY month\nORDER BY month;",
  };
  const chart: ChartBlock = {
    id: 'spending-by-month', kind: 'chart', title: 'Spending by month', position: { x: 708, y: 166 },
    chart: 'bar', x: 'month', y: 'total',
  };
  return {
    id: 'personal-finance', title: 'Personal Finance', sample: true, blocks: [table, sql, chart],
    links: [
      { id: 'transactions-monthly', source: table.id, target: sql.id, alias: 'transactions' },
      { id: 'monthly-chart', source: sql.id, target: chart.id, alias: 'monthly_totals' },
    ],
  };
}
