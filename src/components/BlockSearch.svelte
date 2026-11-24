<script lang="ts">
  import { Search } from 'lucide-svelte';
  import { kinds } from '../lib/workspace';
  import type { Block, BlockKind } from '../lib/workspace';

  let { blocks, icons, onPick }: {
    blocks: Block[];
    icons: Record<BlockKind, typeof Search>;
    onPick: (id: string) => void;
  } = $props();

  const id = $props.id();
  const listId = id + '-results';
  let input: HTMLInputElement;
  let query = $state('');
  let open = $state(false);
  let activeIndex = $state(0);
  let term = $derived(query.trim().toLowerCase());
  let results = $derived(term ? blocks.filter((block) =>
    (block.title + ' ' + kinds[block.kind].label).toLowerCase().includes(term)) : []);
  let expanded = $derived(open && Boolean(term));
  let active = $derived(results[Math.min(activeIndex, results.length - 1)]);

  export function focus() {
    input?.focus();
    input?.select();
    open = true;
  }

  function pick(block: Block) {
    query = '';
    open = false;
    activeIndex = 0;
    onPick(block.id);
  }

  function keyboard(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      open = false;
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      activeIndex = expanded ? (Math.min(activeIndex, results.length - 1) + step + results.length) % results.length : 0;
      open = true;
      document.getElementById(id + '-' + results[activeIndex].id)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && expanded && active) {
      event.preventDefault();
      event.stopPropagation();
      pick(active);
    }
  }
</script>

<div class="block-search" onfocusout={(event) => {
  if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) open = false;
}}>
  <div class="block-search-field">
    <Search size={17} aria-hidden="true" />
    <input bind:this={input} value={query} role="combobox" aria-label="Find a block" placeholder="Find a block…"
      autocomplete="off" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
      aria-activedescendant={expanded && active ? id + '-' + active.id : undefined}
      onfocus={() => open = true} onclick={() => open = true} onkeydown={keyboard}
      oninput={(event) => { query = event.currentTarget.value; activeIndex = 0; open = true; }} />
    <kbd aria-hidden="true">⌘ K</kbd>
  </div>
  {#if expanded}
    <div class="block-search-dropdown">
      <div id={listId} role="listbox" aria-label="Search results">
        {#each results as block (block.id)}
          {@const Icon = icons[block.kind]}
          <button type="button" role="option" tabindex="-1" id={id + '-' + block.id} aria-selected={block.id === active?.id}
            onmousedown={(event) => event.preventDefault()} onclick={() => pick(block)}>
            <span class="kind-icon {block.kind}"><Icon size={16} /></span>
            <span><strong>{block.title}</strong><small>{kinds[block.kind].label}</small></span>
          </button>
        {/each}
      </div>
      {#if !results.length}<p role="status">No matching blocks.</p>{/if}
    </div>
  {/if}
</div>
