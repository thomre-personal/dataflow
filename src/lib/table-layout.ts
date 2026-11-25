export function cardContentHeight(card: HTMLElement, preview: HTMLElement, contentHeight: number) {
  const style = getComputedStyle(preview);
  const chrome = ['.node-heading', '.node-footer'].reduce((height, selector) =>
    height + (card.querySelector<HTMLElement>(selector)?.offsetHeight ?? 0), card.offsetHeight - card.clientHeight);
  return Math.ceil(contentHeight + chrome + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
    + preview.offsetHeight - preview.clientHeight);
}

export function tableCardContentSize(card: HTMLElement, gridWidth?: number, rowDelta = 0) {
  const body = card.querySelector<HTMLElement>('.node-preview');
  const grid = body?.querySelector<HTMLElement>('.editor-grid, .result-grid');
  const table = grid?.querySelector('table');
  if (!body || !grid || !table) return;

  const editor = body.querySelector<HTMLElement>('.table-editor-content');
  const minimumWidth = parseFloat(table.style.minWidth);
  let width = gridWidth ?? table.scrollWidth;
  if (gridWidth === undefined && Number.isFinite(minimumWidth)) {
    const currentWidth = table.style.width;
    table.style.width = minimumWidth + 'px';
    width = Math.max(minimumWidth, table.offsetWidth, table.scrollWidth);
    table.style.width = currentWidth;
  }
  const contentHeight = editor?.offsetHeight ?? table.offsetHeight + grid.offsetHeight - grid.clientHeight;
  return {
    width: Math.max(260, Math.ceil(width + card.offsetWidth - grid.clientWidth)),
    height: Math.max(170, cardContentHeight(card, body, contentHeight + rowDelta)),
  };
}
