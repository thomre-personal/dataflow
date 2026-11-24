import assert from 'node:assert/strict';
import test from 'node:test';
import { bindWorkspaceFormulas } from '../src/lib/formulas.ts';
import { parseWorkspaceDocument, serializeWorkspaceDocument } from '../src/lib/workspace-document.ts';
import { starterWorkspace } from '../src/lib/workspace.ts';

test('workspace files round-trip canvas state and preserve stable formula references', () => {
  const source = starterWorkspace();
  const table = source.blocks[0];
  if (table.kind !== 'table') throw new Error('Expected the sample table first.');
  table.rows.push({ id: 'footer-1', cells: ['Total', '', '=SUM(Amount)'] });
  table.footerRows = 1;
  source.blocks.unshift({ id: 'group-1', kind: 'group', title: 'Summary', position: { x: 20, y: 30 }, expanded: false });
  table.parentId = 'group-1';

  const file = serializeWorkspaceDocument(bindWorkspaceFormulas(source));
  const reopened = parseWorkspaceDocument(file, 'browser-copy');
  assert.equal(reopened.id, 'browser-copy');
  assert.notEqual(reopened.id, source.id);
  assert.equal(serializeWorkspaceDocument(reopened), file);
  assert.deepEqual(reopened.links, source.links);
  const reopenedTable = reopened.blocks[1];
  if (reopenedTable.kind !== 'table') throw new Error('Expected the sample table after its group.');
  assert.equal(reopenedTable.parentId, 'group-1');
  assert.equal(reopenedTable.footerRows, 1);
  assert.deepEqual(reopenedTable.rows.at(-1)?.formulas?.amount, {
    name: 'SUM', source: { columnId: 'amount', reference: 'name' },
  });
});

test('workspace import rejects malformed versions and cyclic or duplicate graph items', () => {
  const workspace = starterWorkspace();
  assert.throws(() => parseWorkspaceDocument('{'), /not valid JSON/);
  assert.throws(() => parseWorkspaceDocument(serializeWorkspaceDocument(workspace).replace('"version": 1', '"version": 2')), /version is not supported/);
  workspace.blocks.push({ id: 'group-a', kind: 'group', title: 'A', position: { x: 0, y: 0 }, parentId: 'group-b' });
  workspace.blocks.push({ id: 'group-b', kind: 'group', title: 'B', position: { x: 0, y: 0 }, parentId: 'group-a' });
  assert.throws(() => parseWorkspaceDocument(serializeWorkspaceDocument(workspace)), /connections or groups/);
  workspace.blocks.splice(-2);
  const sql = { id: 'query-a', kind: 'sql' as const, title: 'A', position: { x: 0, y: 0 }, sql: 'SELECT 42' };
  workspace.blocks.push(sql);
  workspace.links.push({ id: 'cycle-a', source: sql.id, target: 'monthly-totals', alias: 'query_a' });
  workspace.links.push({ id: 'cycle-b', source: 'monthly-totals', target: sql.id, alias: 'monthly_totals' });
  assert.throws(() => parseWorkspaceDocument(serializeWorkspaceDocument(workspace)), /connections or groups/);
  workspace.links.pop();
  workspace.blocks.push(sql);
  assert.throws(() => parseWorkspaceDocument(serializeWorkspaceDocument(workspace)), /invalid workspace data/);
});
