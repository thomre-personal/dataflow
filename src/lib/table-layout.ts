export function tableCardContentSize(card: HTMLElement, gridWidth?: number, rowDelta = 0) {
  const body = card.querySelector<HTMLElement>('.node-preview');
  const grid = body?.querySelector<HTMLElement>('.editor-grid, .result-grid');
  const table = grid?.querySelector('table');
  if (!body || !grid || !table) return;

  const editor = body.querySelector<HTMLElement>('.table-editor-content');
  const minimumWidth = parseFloat(table.style.minWidth);
  const width = gridWidth ?? (Number.isFinite(minimumWidth) ? minimumWidth : table.scrollWidth);
  const bodyStyle = getComputedStyle(body);
  const padding = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
  const contentHeight = editor?.offsetHeight ?? table.offsetHeight + grid.offsetHeight - grid.clientHeight;
  return {
    width: Math.max(260, Math.ceil(width + card.offsetWidth - grid.clientWidth)),
    height: Math.max(170, Math.ceil(contentHeight + rowDelta + padding + card.offsetHeight - body.clientHeight)),
  };
}
