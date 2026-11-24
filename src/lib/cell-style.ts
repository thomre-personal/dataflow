import type { TableBlock } from './workspace.ts';

export const cellFonts = [
  { value: 'sans-serif', label: 'Sans serif' },
  { value: 'serif', label: 'Serif' },
  { value: 'monospace', label: 'Monospace' },
] as const;
export const cellFontSize = { min: 8, max: 72 };
export type CellStyle = {
  color?: string;
  background?: string;
  fontFamily?: typeof cellFonts[number]['value'];
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
};
export type CellStyles = Record<string, Record<string, CellStyle>>;
export type CellAddress = { rowId: string; columnId: string };
export type CellSelection = CellAddress & { end?: CellAddress };

export function cellSelectionBounds(table: TableBlock, selection: CellSelection | undefined) {
  if (!selection) return;
  const row = table.rows.findIndex(({ id }) => id === selection.rowId);
  const column = table.columns.findIndex(({ id }) => id === selection.columnId);
  if (row < 0 || column < 0) return;
  const end = selection.end;
  const endRow = end ? table.rows.findIndex(({ id }) => id === end.rowId) : row;
  const endColumn = end ? table.columns.findIndex(({ id }) => id === end.columnId) : column;
  if (endRow < 0 || endColumn < 0) return { row, column, top: row, left: column, bottom: row, right: column };
  return {
    row, column,
    top: Math.min(row, endRow), bottom: Math.max(row, endRow),
    left: Math.min(column, endColumn), right: Math.max(column, endColumn),
  };
}

export function updateCellStyles(
  table: TableBlock,
  bounds: NonNullable<ReturnType<typeof cellSelectionBounds>>,
  update: (style: CellStyle) => CellStyle,
): CellStyles | undefined {
  const result = { ...table.cellStyles };
  let changed = false;
  for (let row = bounds.top; row <= bounds.bottom; row++) {
    const rowId = table.rows[row].id;
    const previous = result[rowId] ?? {};
    const styles = { ...previous };
    let rowChanged = false;
    for (let column = bounds.left; column <= bounds.right; column++) {
      const id = table.columns[column].id;
      const before = Object.entries(previous[id] ?? {});
      const after = Object.entries(update(previous[id] ?? {})).filter(([, value]) => value !== undefined);
      if (before.length === after.length && after.every(([key, value]) => previous[id]?.[key as keyof CellStyle] === value)) continue;
      if (after.length) styles[id] = Object.fromEntries(after);
      else delete styles[id];
      rowChanged = true;
    }
    if (!rowChanged) continue;
    changed = true;
    if (Object.keys(styles).length) result[rowId] = styles;
    else delete result[rowId];
  }
  return changed ? (Object.keys(result).length ? result : undefined) : table.cellStyles;
}

export const cellFontLineHeight = (size: number) => Math.ceil(size * 1.4);

export function isCellStyle(value: unknown): value is CellStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, field]) => {
    switch (key) {
      case 'color': case 'background': return typeof field === 'string' && /^#[0-9a-f]{6}$/i.test(field);
      case 'fontFamily': return cellFonts.some(({ value }) => value === field);
      case 'fontSize': return typeof field === 'number' && Number.isFinite(field) && field >= cellFontSize.min && field <= cellFontSize.max;
      case 'bold': case 'italic': case 'underline': case 'strikethrough': return typeof field === 'boolean';
      case 'align': return field === 'left' || field === 'center' || field === 'right';
      case 'verticalAlign': return field === 'top' || field === 'middle' || field === 'bottom';
      default: return false;
    }
  });
}

export function cellStyleCss(style: CellStyle | undefined) {
  if (!style) return;
  const rules: string[] = [];
  if (style.color) rules.push('--cell-color:' + style.color, 'color:var(--cell-color)');
  if (style.background) rules.push('--cell-fill:' + style.background, 'background-color:var(--cell-fill)');
  if (style.fontFamily) rules.push('font-family:' + style.fontFamily);
  if (style.fontSize) rules.push('font-size:' + style.fontSize + 'px', '--cell-line-height:' + cellFontLineHeight(style.fontSize) + 'px');
  if (style.bold !== undefined) rules.push('font-weight:' + (style.bold ? '700' : '400'));
  if (style.italic) rules.push('font-style:italic');
  if (style.align) rules.push('--cell-align:' + style.align, 'text-align:var(--cell-align)');
  if (style.verticalAlign) rules.push('vertical-align:' + style.verticalAlign);
  const decoration = [style.underline && 'underline', style.strikethrough && 'line-through'].filter(Boolean).join(' ');
  if (decoration) rules.push('--cell-decoration:' + decoration);
  return rules.join(';');
}
