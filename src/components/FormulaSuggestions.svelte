<script lang="ts">
  import { formulaFunctions } from '../lib/formulas';
  import type { FormulaCall } from '../lib/formulas';

  let { anchor, id, choices, active, pick }: {
    anchor: HTMLTextAreaElement;
    id: string;
    choices: FormulaCall[];
    active: FormulaCall;
    pick: (name: FormulaCall) => void;
  } = $props();
  let popup = $state<HTMLDivElement>();

  $effect(() => {
    if (!popup) return;
    const element = popup;
    const input = anchor;
    function place() {
      const bounds = input.getBoundingClientRect();
      const width = Math.min(Math.max(bounds.width, 300), innerWidth - 16);
      element.style.width = width + 'px';
      const height = element.offsetHeight;
      const below = innerHeight - bounds.bottom - 8;
      const above = bounds.top - 8;
      const top = below < height + 5 && above > below ? bounds.top - height - 5 : bounds.bottom + 5;
      element.style.left = Math.max(8, Math.min(bounds.left, innerWidth - width - 8)) + 'px';
      element.style.top = Math.max(8, Math.min(top, innerHeight - height - 8)) + 'px';
    }
    element.showPopover();
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    observer.observe(input);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      if (element.matches(':popover-open')) element.hidePopover();
      observer.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  });

  $effect(() => {
    if (!popup) return;
    popup.querySelector<HTMLElement>('#' + CSS.escape(id + '-' + active))?.scrollIntoView({ block: 'nearest' });
  });
</script>

<div bind:this={popup} class="formula-suggestions" popover="manual" {id} role="listbox" aria-label="Formula suggestions">
  {#each choices as name (name)}
    <button type="button" role="option" tabindex="-1" id={id + '-' + name} aria-selected={name === active}
      onmousedown={(event) => event.preventDefault()} onclick={() => pick(name)}>
      <code>{formulaFunctions[name].signature}</code>
    </button>
  {/each}
</div>
