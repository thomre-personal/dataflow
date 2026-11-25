import { evaluateConfigField } from './config';
import { queryInputs, tableInputs } from './workspace';
import type { ConfigBlock, Formula, FormulaColumn, ScalarExpression, SqlBlock, TableBlock, Workspace } from './workspace';

type Reference = (blockId: string, fieldId?: string) => boolean;

function scalarUses(expression: ScalarExpression, matches: Reference): boolean {
  if (expression.kind === 'config') return matches(expression.blockId, expression.fieldId);
  return expression.kind === 'binary' && (scalarUses(expression.left, matches) || scalarUses(expression.right, matches));
}

function formulaUses(formula: Formula | FormulaColumn, matches: Reference): boolean {
  if ('columnId' in formula) return formula.tableId !== undefined && matches(formula.tableId);
  if (formula.name === 'VALUE') return scalarUses(formula.expression, matches);
  if (formula.name === 'CONCAT' || 'args' in formula) {
    const parts = formula.name === 'CONCAT' ? formula.parts : formula.args;
    return parts.some((part) => 'expression' in part ? formulaUses(part.expression, matches)
      : 'columnId' in part && formulaUses(part, matches));
  }
  return ('condition' in formula && formulaUses(formula.condition, matches))
    || ('source' in formula && !!formula.source && formulaUses(formula.source, matches));
}

function tableUses(table: TableBlock, matches: Reference) {
  return table.rows.some((row) => row.formulas && Object.values(row.formulas).some((formula) => formulaUses(formula, matches)));
}

export function configDependents(previous: Workspace, next: Workspace, relations: (query: SqlBlock) => ReadonlySet<string> | undefined) {
  const before = new Map(previous.blocks.flatMap((block) => block.kind === 'config' ? [[block.id, block]] : []));
  const after = new Map(next.blocks.flatMap((block) => block.kind === 'config' ? [[block.id, block]] : []));
  const configs = new Set([...before.keys(), ...after.keys()]);
  const fields = new Map<string, Set<string>>();
  const changedRelations = new Set<string>();
  let scopeChanged = previous.links !== next.links;
  for (const id of configs) {
    const old = before.get(id);
    const current = after.get(id);
    if (old === current) continue;
    if (old?.title !== current?.title || old?.global !== current?.global) scopeChanged = true;
    if (old?.fields === current?.fields) continue;
    const fieldValues = (config: ConfigBlock | undefined) => new Map(config?.fields.map((field) => {
      const evaluated = evaluateConfigField(field);
      return [field.id, JSON.stringify(evaluated.message === undefined ? evaluated : [field.name, evaluated.message])];
    }));
    const oldValues = fieldValues(old);
    const values = fieldValues(current);
    const changes = new Set([...oldValues.keys(), ...values.keys()].filter((fieldId) => oldValues.get(fieldId) !== values.get(fieldId)));
    if (changes.size) fields.set(id, changes);
    if (changes.size || old?.fields.length !== current?.fields.length ||
      current?.fields.some((field, index) => field.name !== old?.fields[index]?.name || field.id !== old?.fields[index]?.id)) {
      changedRelations.add(id);
    }
  }

  const affected = new Set<string>();
  if (!configs.size || (!scopeChanged && !changedRelations.size)) return affected;
  const configIds = (workspace: Workspace, id: string) => new Set(tableInputs(workspace, id)
    .flatMap((input) => 'config' in input ? [input.config.id] : []));
  const configAliases = (workspace: Workspace, id: string, names?: ReadonlySet<string>) => new Map(queryInputs(workspace, id, names)
    .flatMap(({ block, alias }) => block.kind === 'config' ? [[alias, block.id]] : []));

  for (const block of next.blocks) {
    if (block.kind === 'table') {
      const old = configIds(previous, block.id);
      const current = configIds(next, block.id);
      if (tableUses(block, (id, field) => field !== undefined &&
        (old.has(id) !== current.has(id) || (current.has(id) && fields.get(id)?.has(field) === true)))) {
        affected.add(block.id);
      }
    } else if (block.kind === 'sql') {
      const names = relations(block);
      const old = configAliases(previous, block.id, names);
      const current = configAliases(next, block.id, names);
      if (old.size !== current.size || [...current].some(([alias, id]) => old.get(alias) !== id || changedRelations.has(id))) {
        affected.add(block.id);
      }
    }
  }

  const blocks = new Map(next.blocks.map((block) => [block.id, block]));
  for (const id of affected) {
    for (const link of next.links) {
      if (link.source !== id || affected.has(link.target)) continue;
      const target = blocks.get(link.target);
      if (target?.kind === 'chart' ||
        (target?.kind === 'sql' && relations(target)?.has(link.alias.toLowerCase()) !== false) ||
        (target?.kind === 'table' && tableUses(target, (source, field) => field === undefined && source === id))) {
        affected.add(target.id);
      }
    }
  }
  return affected;
}
