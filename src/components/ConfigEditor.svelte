<script lang="ts">
  import { Plus, Trash2 } from 'lucide-svelte';
  import { applyConfigValue, configFieldTypes, createConfigField } from '../lib/config';
  import { newId } from '../lib/workspace';
  import type { ConfigBlock, ConfigField, ConfigValue } from '../lib/workspace';
  import type { Confirmation } from './ConfirmDialog.svelte';

  let { block, change, confirm, manage = false }: {
    block: ConfigBlock;
    change: (patch: Pick<Partial<ConfigBlock>, 'fields' | 'presets'>) => void;
    confirm: (request: Confirmation) => void;
    manage?: boolean;
  } = $props();

  let presetName = $state('');
  let presetId = $state('');
  let error = $state('');
  let preset = $derived(block.presets.find(({ id }) => id === presetId));
  const editorId = $props.id();

  function update(field: ConfigField) {
    error = '';
    change({ fields: block.fields.map((item) => item.id === field.id ? field : item) });
  }

  function nameField(field: ConfigField, input: HTMLInputElement) {
    const name = input.value.trim();
    if (!name || block.fields.some((item) => item.id !== field.id && item.name.toLowerCase() === name.toLowerCase())) {
      error = 'Use a unique field name.';
      input.value = field.name;
      return;
    }
    update({ ...field, name });
  }

  function addField() {
    let index = block.fields.length + 1;
    while (block.fields.some(({ name }) => name.toLowerCase() === 'value' + index)) index++;
    error = '';
    change({ fields: [...block.fields, createConfigField(newId(), 'Value' + index, 'input')] });
  }

  function changeLimit(field: Extract<ConfigField, { type: 'slider' }>, key: 'min' | 'max' | 'step', input: HTMLInputElement) {
    const next = { ...field, [key]: input.valueAsNumber };
    if (!Number.isFinite(next[key]) || next.min >= next.max || next.step <= 0) {
      input.value = String(field[key]);
      error = 'Use a minimum below the maximum and a step greater than zero.';
      return;
    }
    update(applyConfigValue(next, field.value));
  }

  function savePreset(event: SubmitEvent) {
    event.preventDefault();
    const name = presetName.trim();
    if (!name || !block.fields.length) return;
    if (block.presets.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      error = 'A preset with that name already exists.';
      return;
    }
    const values = Object.fromEntries(block.fields.map(({ id, value }) => [id, Array.isArray(value) ? [...value] : value]));
    const id = newId();
    change({ presets: [...block.presets, { id, name, values }] });
    presetId = id;
    presetName = '';
    error = '';
  }

  function loadPreset() {
    if (!preset) return;
    const { values } = preset;
    error = '';
    change({ fields: block.fields.map((field) => applyConfigValue(field, values[field.id])) });
  }

  function removeField(field: ConfigField) {
    confirm({
      title: 'Delete config field?', message: 'Delete “' + field.name + '” from this config?', label: 'Delete field',
      accept: () => change({ fields: block.fields.filter(({ id }) => id !== field.id) }),
    });
  }

  function removePreset() {
    if (!preset) return;
    const { id, name } = preset;
    confirm({
      title: 'Delete preset?', message: 'Delete “' + name + '” from this config?', label: 'Delete preset',
      accept: () => { change({ presets: block.presets.filter((item) => item.id !== id) }); presetId = ''; },
    });
  }

  function setValue(field: ConfigField, value: ConfigValue) {
    update(applyConfigValue(field, value));
  }
</script>

<div class="config-editor">
  {#if block.presets.length || manage}
    <section class="config-presets" aria-label="Presets">
      {#if block.presets.length}
        <div class="config-actions">
          <label class="field">Preset<select bind:value={presetId}>
            <option value="">Choose a preset</option>
            {#each block.presets as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
          </select></label>
          <button type="button" class="button secondary" disabled={!preset} onclick={loadPreset}>Load preset</button>
          {#if manage}<button type="button" class="icon-button delete-block" aria-label="Delete preset" disabled={!preset} onclick={removePreset}><Trash2 size={14} /></button>{/if}
        </div>
      {/if}
      {#if manage}
        <form class="config-actions" onsubmit={savePreset}>
          <label class="field">Preset name<input maxlength="100" bind:value={presetName} /></label>
          <button class="button secondary" disabled={!presetName.trim() || !block.fields.length}>Save preset</button>
        </form>
      {/if}
    </section>
  {/if}
  {#each block.fields as field (field.id)}
    <section class="config-field" aria-label={field.name}>
      {#if manage}
        <div class="config-actions">
          <label class="field">Field name<input value={field.name} maxlength="80" onchange={(event) => nameField(field, event.currentTarget)} /></label>
          <label class="field">Control<select value={field.type} onchange={(event) => update(createConfigField(field.id, field.name, event.currentTarget.value as ConfigField['type']))}>
            {#each Object.entries(configFieldTypes) as [type, label]}<option value={type}>{label}</option>{/each}
          </select></label>
          <button type="button" class="icon-button delete-block" aria-label={'Delete field ' + field.name} onclick={() => removeField(field)}><Trash2 size={14} /></button>
        </div>
        {#if field.type === 'slider'}
          <div class="config-actions">
            <label class="field">Minimum<input type="number" step="any" value={field.min} onchange={(event) => changeLimit(field, 'min', event.currentTarget)} /></label>
            <label class="field">Maximum<input type="number" step="any" value={field.max} onchange={(event) => changeLimit(field, 'max', event.currentTarget)} /></label>
            <label class="field">Step<input type="number" step="any" value={field.step} onchange={(event) => changeLimit(field, 'step', event.currentTarget)} /></label>
          </div>
        {:else if field.type === 'multi'}
          <label class="field">Options (one per line)<textarea rows="2" value={field.options.join('\n')} onchange={(event) => {
            const options = [...new Set(event.currentTarget.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
            update({ ...field, options, value: field.value.filter((value) => options.includes(value)) });
          }}></textarea></label>
        {/if}
      {/if}
      {#if field.type === 'input'}
        <label class="field">{field.name}<input value={field.value} onchange={(event) => setValue(field, event.currentTarget.value)} /></label>
      {:else if field.type === 'slider'}
        <label class="field config-slider" for={editorId + '-' + field.id}>{field.name}
          <span>{field.value}</span>
          <input id={editorId + '-' + field.id} aria-label={field.name} type="range" min={field.min} max={field.max}
            step={field.step} value={field.value} onchange={(event) => setValue(field, event.currentTarget.valueAsNumber)} />
        </label>
      {:else if field.type === 'toggle'}
        <label class="checkbox"><input type="checkbox" checked={field.value} onchange={(event) => setValue(field, event.currentTarget.checked)} />{field.name}</label>
      {:else}
        <fieldset class="config-options"><legend class="field">{field.name}</legend>
          {#each field.options as option (option)}
            <label class="checkbox"><input type="checkbox" checked={field.value.includes(option)} onchange={(event) =>
              setValue(field, event.currentTarget.checked ? [...field.value, option] : field.value.filter((value) => value !== option))} />{option}</label>
          {/each}
        </fieldset>
      {/if}
    </section>
  {/each}
  {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
  {#if manage}
    <button type="button" class="button secondary" onclick={addField}><Plus size={14} /> Add field</button>
  {:else if !block.fields.length}
    <p class="helper-text">Open the config to add fields.</p>
  {/if}
</div>
