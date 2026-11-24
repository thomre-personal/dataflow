<script lang="ts">
  import { Bold, ChevronRight, ClipboardPaste, Copy, Italic, RotateCcw, Search, Strikethrough, Underline, X } from 'lucide-svelte';
  import { cellFonts, cellFontSize } from '../lib/cell-style';
  import type { CellStyle } from '../lib/cell-style';
  import { formulaCatalog, formulaFunctions, usedFormulaFunctions } from '../lib/formulas';
  import type { FormulaFunction } from '../lib/formulas';
  import { hotkeyLabel } from '../lib/preferences';
  import type { Hotkeys } from '../lib/preferences';

  let { address, column, formula, format, defaultBold, hotkeys, canPaste, clear, changeStyle, copyStyle, pasteStyle, resetStyle }: {
    address: string;
    column?: string;
    formula: string;
    format: CellStyle;
    defaultBold: boolean;
    hotkeys: Hotkeys;
    canPaste: boolean;
    clear: () => void;
    changeStyle: (patch: CellStyle) => void;
    copyStyle: () => void;
    pasteStyle: () => void;
    resetStyle: () => void;
  } = $props();

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
        <button type="button" class="icon-button small" aria-label="Copy cell style" title={'Copy cell style (' + hotkeyLabel(hotkeys.copyCellStyle) + ')'}
          onclick={copyStyle}><Copy size={14} /></button>
        <button type="button" class="icon-button small" aria-label="Paste cell style" title={'Paste cell style (' + hotkeyLabel(hotkeys.pasteCellStyle) + ')'}
          disabled={!canPaste} onclick={pasteStyle}><ClipboardPaste size={14} /></button>
        <button type="button" class="icon-button small" aria-label="Reset cell style" title="Reset cell style"
          onclick={resetStyle}><RotateCcw size={14} /></button>
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
          <label>{label}<input type="color" value={format[key] ?? initial} class:default-color={!format[key]} style:--default-color={theme}
            onchange={(event) => changeStyle({ [key]: event.currentTarget.value })} /></label>
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
