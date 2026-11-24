<script lang="ts">
  import { ChevronRight, Search, X } from 'lucide-svelte';
  import { formulaCatalog, formulaFunctions, usedFormulaFunctions } from '../lib/formulas';
  import type { FormulaFunction } from '../lib/formulas';

  let { address, column, formula, clear }: {
    address: string;
    column?: string;
    formula: string;
    clear: () => void;
  } = $props();

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
