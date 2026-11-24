<script lang="ts">
  import { defaultHotkeys, eventHotkey, hotkeyLabel } from '../lib/preferences';
  import type { HotkeyAction, Preferences } from '../lib/preferences';
  import Modal from './Modal.svelte';

  let { preferences, change, close }: {
    preferences: Preferences;
    change: (preferences: Preferences) => void;
    close: () => void;
  } = $props();
  const shortcuts: Record<HotkeyAction, string> = {
    search: 'Find a block', runQuery: 'Run SQL query', undo: 'Undo', redo: 'Redo', deleteBlock: 'Delete selection',
    rowAbove: 'Insert row above', rowBelow: 'Insert row below', columnLeft: 'Insert column left', columnRight: 'Insert column right',
  };
  let recording = $state<HotkeyAction>();
  let error = $state('');

  function record(event: KeyboardEvent, action: HotkeyAction) {
    if (recording !== action || event.key === 'Tab') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      recording = undefined;
      error = '';
      return;
    }
    const shortcut = eventHotkey(event);
    if (!shortcut || event.repeat) return;
    if (!shortcut.includes('+') && shortcut !== 'Delete' && !/^F\d+$/.test(shortcut)) {
      error = 'Use a modifier, Delete, or a function key.';
      return;
    }
    const occupied = (Object.keys(shortcuts) as HotkeyAction[]).find((item) => item !== action && preferences.hotkeys[item] === shortcut);
    if (occupied) {
      error = 'This shortcut is already used for ' + shortcuts[occupied] + '.';
      return;
    }
    change({ ...preferences, hotkeys: { ...preferences.hotkeys, [action]: shortcut } });
    recording = undefined;
    error = '';
  }
</script>

{#snippet content()}
  <div class="settings-preferences">
    <label class="field">Appearance
      <select value={preferences.theme} onchange={(event) => change({ ...preferences, theme: event.currentTarget.value as Preferences['theme'] })}>
        <option value="auto">Auto</option><option value="light">Light</option><option value="dark">Dark</option>
      </select>
    </label>
    <label class="checkbox"><input type="checkbox" checked={preferences.confirmHotkeyDelete}
      onchange={(event) => change({ ...preferences, confirmHotkeyDelete: event.currentTarget.checked })} />Confirm block deletion by shortcut</label>
  </div>
  <section class="settings-shortcuts" aria-label="Keyboard shortcuts">
    <h3>Keyboard shortcuts</h3>
    {#each Object.entries(shortcuts) as [key, label]}
      {@const action = key as HotkeyAction}
      <div class="shortcut-row"><span>{label}</span><button type="button" class="button secondary" aria-label={'Change shortcut for ' + label}
        onclick={() => { recording = action; error = ''; }} onkeydown={(event) => record(event, action)}
        onblur={() => { if (recording === action) recording = undefined; }}>
        {#if recording === action}Press keys…{:else}<kbd>{hotkeyLabel(preferences.hotkeys[action])}</kbd>{/if}
      </button></div>
    {/each}
    {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
  </section>
{/snippet}

{#snippet footer()}
  <button class="button secondary" onclick={() => { change({ ...preferences, hotkeys: defaultHotkeys }); recording = undefined; error = ''; }}>Reset shortcuts</button>
  <button class="button primary" onclick={close}>Done</button>
{/snippet}

<Modal title="Settings" {close} children={content} {footer} />
