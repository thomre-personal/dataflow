<script lang="ts">
  import {
    AlignCenter, AlignEndHorizontal, AlignLeft, AlignRight, AlignStartHorizontal, AlignCenterHorizontal,
    Bold, ChevronRight, ClipboardPaste, Copy, Italic, RotateCcw, Search, Strikethrough, Underline, X,
  } from 'lucide-svelte';
  import { cellFonts, cellFontSize } from '../lib/cell-style';
  import type { CellStyle } from '../lib/cell-style';
  import { formulaCatalog, formulaFunctions, usedFormulaFunctions } from '../lib/formulas';
  import type { FormulaFunction } from '../lib/formulas';
  import { hotkeyLabel } from '../lib/preferences';
  import type { Hotkeys } from '../lib/preferences';
  import Modal from './Modal.svelte';

  let { address, column, formula, format, defaultBold, selectionKey, axis, hotkeys, canPaste, clear, changeStyle, copyStyle, pasteStyle, resetStyle }: {
    address: string;
    column?: string;
    formula: string;
    format: CellStyle;
    defaultBold: boolean;
    selectionKey: string;
    axis?: 'row' | 'column';
    hotkeys: Hotkeys;
    canPaste: boolean;
    clear: () => void;
    changeStyle: (patch: CellStyle) => void;
    copyStyle: () => void;
    pasteStyle: () => void;
    resetStyle: () => void;
  } = $props();
  let styleLabel = $derived(axis ? axis + ' styles' : 'cell style');

  const decorations = [
    { key: 'bold', label: 'Bold', icon: Bold },
    { key: 'italic', label: 'Italic', icon: Italic },
    { key: 'underline', label: 'Underline', icon: Underline },
    { key: 'strikethrough', label: 'Strikethrough', icon: Strikethrough },
  ] as const;
  const colors = [
    { key: 'color', label: 'Font color', initial: '#000000', theme: 'var(--text)' },
    { key: 'background', label: 'Background color', initial: '#ffffff', theme: 'var(--surface)' },
  ] as const;
  const horizontal = [
    { value: 'left', label: 'Align left', icon: AlignLeft },
    { value: 'center', label: 'Align center', icon: AlignCenter },
    { value: 'right', label: 'Align right', icon: AlignRight },
  ] as const;
  const vertical = [
    { value: 'top', label: 'Align top', icon: AlignStartHorizontal },
    { value: 'middle', label: 'Align middle', icon: AlignCenterHorizontal },
    { value: 'bottom', label: 'Align bottom', icon: AlignEndHorizontal },
  ] as const;
  const families = ['Gray', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple'];
  const palette = [
    ['#ffffff', '#fee2e2', '#ffedd5', '#fef9c3', '#dcfce7', '#ccfbf1', '#dbeafe', '#f3e8ff'],
    ['#e2e8f0', '#fca5a5', '#fdba74', '#fde047', '#86efac', '#5eead4', '#93c5fd', '#d8b4fe'],
    ['#94a3b8', '#f87171', '#fb923c', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#a855f7'],
    ['#475569', '#dc2626', '#ea580c', '#a16207', '#15803d', '#0f766e', '#1d4ed8', '#7e22ce'],
    ['#0f172a', '#7f1d1d', '#7c2d12', '#713f12', '#14532d', '#134e4a', '#1e3a8a', '#581c87'],
  ];
  let picker = $state<{ key: 'color' | 'background'; label: string; value: string; selection: string; changed: boolean }>();

  function applyColor() {
    if (picker?.changed && picker.selection === selectionKey) changeStyle({ [picker.key]: picker.value });
    picker = undefined;
  }

  const id = $props.id();
  let search = $state('');
  let used = $derived(usedFormulaFunctions(formula));
  let matches = $derived.by(() => {
    const query = search.trim().toLowerCase();
    return formulaCatalog.filter((name) => {
      const { signature, description } = formulaFunctions[name];
      return (signature + ' ' + description).toLowerCase().includes(query);
    });
  });
</script>

{#snippet functionDetails(name: FormulaFunction)}
  {@const doc = formulaFunctions[name]}
  <details class="function-reference">
    <summary><ChevronRight size={13} /><code>{name}</code></summary>
    <div class="function-doc">
      <code class="function-signature">{doc.signature}</code>
      <p>{doc.description}</p>
      <code>{doc.example}</code>
    </div>
  </details>
{/snippet}

<section class="cell-inspector" aria-labelledby={id}>
  <div class="cell-inspector-heading">
    <h3 {id}>Cell options</h3>
    <span class="cell-address">{address}</span>
    <button class="icon-button small" aria-label="Clear cell selection" title="Clear cell selection" onclick={clear}><X size={14} /></button>
  </div>
  {#if column}<p class="cell-column" title={column}>{column}</p>{/if}
  {#if formula}<pre class="cell-formula" aria-label="Cell formula"><code>{formula}</code></pre>{/if}
  <section class="cell-functions cell-format-controls" aria-label="Cell formatting">
    <h4>Formatting</h4>
    <div class="cell-format-row">
      <div class="cell-format-buttons" role="group" aria-label="Text styles">
        {#each decorations as { key, label, icon: Icon } (key)}
          {@const enabled = format[key] ?? (key === 'bold' && defaultBold)}
          <button type="button" class="icon-button small" aria-label={label} aria-pressed={enabled} title={label}
            onclick={() => changeStyle({ [key]: !enabled })}><Icon size={15} /></button>
        {/each}
      </div>
      <div class="cell-format-buttons" role="group" aria-label="Style actions">
        <button type="button" class="icon-button small" aria-label={'Copy ' + styleLabel} title={'Copy ' + styleLabel + ' (' + hotkeyLabel(hotkeys.copyCellStyle) + ')'}
          onclick={copyStyle}><Copy size={14} /></button>
        <button type="button" class="icon-button small" aria-label={'Paste ' + styleLabel} title={'Paste ' + styleLabel + ' (' + hotkeyLabel(hotkeys.pasteCellStyle) + ')'}
          disabled={!canPaste} onclick={pasteStyle}><ClipboardPaste size={14} /></button>
        <button type="button" class="icon-button small" aria-label="Reset cell style" title="Reset cell style"
          onclick={resetStyle}><RotateCcw size={14} /></button>
      </div>
    </div>
    <div class="cell-format-row cell-alignment">
      <div class="cell-format-buttons" role="group" aria-label="Horizontal alignment">
        {#each horizontal as { value, label, icon: Icon } (value)}
          <button type="button" class="icon-button small" aria-label={label} title={label} aria-pressed={format.align === value}
            onclick={() => changeStyle({ align: format.align === value ? undefined : value })}><Icon size={15} /></button>
        {/each}
      </div>
      <div class="cell-format-buttons" role="group" aria-label="Vertical alignment">
        {#each vertical as { value, label, icon: Icon } (value)}
          <button type="button" class="icon-button small" aria-label={label} title={label} aria-pressed={format.verticalAlign === value}
            onclick={() => changeStyle({ verticalAlign: format.verticalAlign === value ? undefined : value })}><Icon size={15} /></button>
        {/each}
      </div>
    </div>
    <div class="cell-format-fields">
      <label class="field">Font
        <select value={format.fontFamily ?? ''} onchange={(event) => changeStyle({
          fontFamily: (event.currentTarget.value || undefined) as CellStyle['fontFamily'],
        })}>
          <option value="">Default</option>
          {#each cellFonts as { value, label } (value)}<option {value}>{label}</option>{/each}
        </select>
      </label>
      <label class="field">Font size
        <input type="number" min={cellFontSize.min} max={cellFontSize.max} placeholder="Default"
          value={format.fontSize ?? ''} onchange={(event) => {
            const { value, valueAsNumber } = event.currentTarget;
            const size = Number.isFinite(valueAsNumber) ? Math.min(cellFontSize.max, Math.max(cellFontSize.min, valueAsNumber)) : undefined;
            if (value && size !== undefined) event.currentTarget.value = String(size);
            changeStyle({ fontSize: size });
          }} />
      </label>
    </div>
    <div class="cell-format-colors">
      {#each colors as { key, label, initial, theme } (key)}
        <div class="cell-format-color">
          <div>
            <span>{label}</span>
            <button type="button" class="cell-color-swatch" aria-label={label} title={label} style:background={format[key] ?? theme}
              onclick={() => picker = { key, label, value: format[key] ?? initial, selection: selectionKey, changed: false }}></button>
          </div>
          <button type="button" class="icon-button small" aria-label={'Reset ' + label.toLowerCase()} title={'Reset ' + label.toLowerCase()}
            disabled={!format[key]} onclick={() => changeStyle({ [key]: undefined })}><X size={12} /></button>
        </div>
      {/each}
    </div>
  </section>
  <section class="cell-functions" aria-label="Functions in this cell">
    <h4>Functions in this cell</h4>
    {#if used.length}
      {#each used as name (name)}{@render functionDetails(name)}{/each}
    {:else}
      <p class="helper-text">No functions in this cell.</p>
    {/if}
  </section>
  <section class="cell-functions" aria-label="Function catalog">
    <h4>Function catalog</h4>
    <label class="function-search"><Search size={14} />
      <input type="search" placeholder="Search functions…" aria-label="Search functions" bind:value={search} />
    </label>
    {#each matches as name (name)}
      {@render functionDetails(name)}
    {:else}
      <p class="helper-text" role="status">No matching functions.</p>
    {/each}
  </section>
</section>

{#if picker}
  {@const current = picker}
  {#snippet pickerContent()}
    <div class="cell-color-palette" role="group" aria-label="Color palette">
      {#each palette as shades, row}
        {#each shades as swatch, column (swatch)}
          <button type="button" style:background={swatch} title={families[column] + ' ' + (row + 1)}
            aria-label={families[column] + ' ' + (row + 1)} aria-pressed={current.value === swatch}
            onclick={() => { current.value = swatch; current.changed = true; }}></button>
        {/each}
      {/each}
    </div>
    <label class="cell-custom-color">Custom color
      <input type="color" value={current.value}
        oninput={(event) => { current.value = event.currentTarget.value; current.changed = true; }}
        onchange={(event) => { current.value = event.currentTarget.value; current.changed = true; }} />
    </label>
  {/snippet}
  {#snippet pickerFooter()}
    <button type="button" class="button secondary" onclick={() => picker = undefined}>Cancel</button>
    <button type="button" class="button primary" disabled={!current.changed} onclick={applyColor}>Apply</button>
  {/snippet}
  <Modal className="cell-color-dialog" title={current.label} close={() => picker = undefined} children={pickerContent} footer={pickerFooter} />
{/if}
