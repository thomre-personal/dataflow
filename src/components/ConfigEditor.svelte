<script lang="ts">
  import { Plus, Trash2 } from 'lucide-svelte';
  import { applyConfigValue, configDataTypes, configFieldDataType, configFieldTypes, createConfigField, evaluateConfigField, loadConfigPreset } from '../lib/config';
  import { newId } from '../lib/workspace';
  import type { ColumnType, ConfigBlock, ConfigField, ConfigValue } from '../lib/workspace';
  import type { Confirmation } from './ConfirmDialog.svelte';
  import Modal from './Modal.svelte';

  let { block, change, confirm, manage = false }: {
    block: ConfigBlock;
    change: (patch: Pick<Partial<ConfigBlock>, 'fields' | 'presets' | 'activePresetId'>) => void;
    confirm: (request: Confirmation) => void;
    manage?: boolean;
  } = $props();

  let presetName = $state('');
  let presetSelection = $state<string>();
  let creatingPreset = $state(false);
  let presetError = $state('');
  let error = $state('');
  let preset = $derived(block.presets.find(({ id }) => id === (presetSelection ?? block.activePresetId)));
  let issues = $derived(new Map(block.fields.map((field) => [field.id, evaluateConfigField(field).message])));
  let hasIssues = $derived([...issues.values()].some(Boolean));
  let canSavePreset = $derived(Boolean(preset && preset.id === block.activePresetId && !hasIssues));
  const editorId = $props.id();
  const presetFormId = editorId + '-new-preset';

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

  function selectPreset(select: HTMLSelectElement) {
    if (select.selectedOptions[0]?.hasAttribute('data-new-preset')) {
      select.value = preset?.id ?? '';
      presetName = '';
      presetError = '';
      creatingPreset = true;
    } else {
      presetSelection = select.value;
      error = '';
    }
  }

  function presetValues() {
    return Object.fromEntries(block.fields.map(({ id, value }) => [id, Array.isArray(value) ? [...value] : value]));
  }

  function createPreset(event: SubmitEvent) {
    event.preventDefault();
    const name = presetName.trim();
    if (!name || !block.fields.length || hasIssues) return;
    if (block.presets.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      presetError = 'A preset with that name already exists.';
      return;
    }
    const id = newId();
    change({ presets: [...block.presets, { id, name, values: presetValues() }], activePresetId: id });
    presetSelection = undefined;
    creatingPreset = false;
    error = '';
  }

  function savePreset() {
    if (!canSavePreset || !preset) return;
    const { id } = preset;
    const values = presetValues();
    change({ presets: block.presets.map((item) => item.id === id ? { ...item, values } : item) });
    error = '';
  }

  function loadPreset() {
    if (!preset) return;
    const result = loadConfigPreset(block, preset);
    if (result.message !== undefined) {
      error = 'Could not load the preset. ' + result.message;
      return;
    }
    error = '';
    change({ fields: result.fields, activePresetId: preset.id });
    presetSelection = undefined;
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
      accept: () => {
        change({ presets: block.presets.filter((item) => item.id !== id),
          activePresetId: block.activePresetId === id ? undefined : block.activePresetId });
        presetSelection = undefined;
      },
    });
  }

  function setValue(field: ConfigField, value: ConfigValue) {
    update(applyConfigValue(field, value));
  }
</script>

{#snippet fieldControl(field: ConfigField, issueId: string | undefined)}
  {#if field.type === 'input'}
    <label class="field"><span class:sr-only={!manage}>{field.name}</span><input value={field.value} aria-invalid={Boolean(issueId)} aria-describedby={issueId}
      onchange={(event) => setValue(field, event.currentTarget.value)} /></label>
  {:else if field.type === 'slider'}
    <label class="field config-slider" for={editorId + '-' + field.id}>
      {#if manage}<span>{field.name}</span>{/if}
      <span class="config-slider-value">{field.value}</span>
      <input id={editorId + '-' + field.id} aria-label={field.name} type="range" min={field.min} max={field.max}
        step={field.step} value={field.value} onchange={(event) => setValue(field, event.currentTarget.valueAsNumber)} />
    </label>
  {:else if field.type === 'toggle'}
    <label class="checkbox"><input type="checkbox" checked={field.value} onchange={(event) => setValue(field, event.currentTarget.checked)} />
      <span class:sr-only={!manage}>{field.name}</span></label>
  {:else}
    <fieldset class="config-options"><legend class="field" class:sr-only={!manage}>{field.name}</legend>
      {#each field.options as option (option)}
        <label class="checkbox"><input type="checkbox" checked={field.value.includes(option)} onchange={(event) =>
          setValue(field, event.currentTarget.checked ? [...field.value, option] : field.value.filter((value) => value !== option))} />{option}</label>
      {/each}
    </fieldset>
  {/if}
{/snippet}

<div class="config-editor">
  {#if !manage && block.fields.length}
    <section class="config-presets" aria-label="Presets">
      <select class="inline-select" aria-label="Preset" value={preset?.id ?? ''} onchange={(event) => selectPreset(event.currentTarget)}>
        <option value="" disabled>Choose a preset</option>
        {#each block.presets as item (item.id)}<option value={item.id}>{item.name}</option>{/each}
        <option value={presetFormId} data-new-preset disabled={hasIssues}>New preset…</option>
      </select>
      <button type="button" class="button secondary" aria-label="Load preset" disabled={!preset} onclick={loadPreset}>Load</button>
      <button type="button" class="button secondary" aria-label="Save preset" disabled={!canSavePreset} onclick={savePreset}>Save</button>
      <button type="button" class="icon-button delete-block" aria-label="Delete preset" disabled={!preset} onclick={removePreset}><Trash2 size={14} /></button>
    </section>
  {/if}
  {#if error}<p class="inline-error" role="alert">{error}</p>{/if}
  {#if manage}
    {#each block.fields as field (field.id)}
      {@const issue = issues.get(field.id)}
      {@const issueId = issue ? editorId + '-error-' + field.id : undefined}
      <section class="config-field" aria-label={field.name}>
        <div class="config-actions">
          <label class="field">Field name<input value={field.name} maxlength="80" onchange={(event) => nameField(field, event.currentTarget)} /></label>
          <label class="field">Control<select value={field.type} onchange={(event) => update(createConfigField(field.id, field.name, event.currentTarget.value as ConfigField['type']))}>
            {#each Object.entries(configFieldTypes) as [type, label]}<option value={type}>{label}</option>{/each}
          </select></label>
          <button type="button" class="icon-button delete-block" aria-label={'Delete field ' + field.name} onclick={() => removeField(field)}><Trash2 size={14} /></button>
        </div>
        <label class="field">Data type<select value={configFieldDataType(field)} disabled={field.type === 'slider' || field.type === 'toggle'}
          onchange={(event) => {
            if (field.type === 'input' || field.type === 'multi') update({ ...field, dataType: event.currentTarget.value as ColumnType });
          }}>
          {#each Object.entries(configDataTypes) as [type, label]}<option value={type}>{label}</option>{/each}
        </select></label>
        {#if field.type === 'slider'}
          <div class="config-actions">
            <label class="field">Minimum<input type="number" step="any" value={field.min} onchange={(event) => changeLimit(field, 'min', event.currentTarget)} /></label>
            <label class="field">Maximum<input type="number" step="any" value={field.max} onchange={(event) => changeLimit(field, 'max', event.currentTarget)} /></label>
            <label class="field">Step<input type="number" step="any" value={field.step} onchange={(event) => changeLimit(field, 'step', event.currentTarget)} /></label>
          </div>
        {:else if field.type === 'multi'}
          <label class="field">Options (one per line)<textarea rows="2" value={field.options.join('\n')} aria-invalid={Boolean(issue)}
            aria-describedby={issueId} onchange={(event) => {
            const options = [...new Set(event.currentTarget.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean))];
            update({ ...field, options, value: field.value.filter((value) => options.includes(value)) });
          }}></textarea></label>
        {/if}
        {@render fieldControl(field, issueId)}
        {#if issue}<p id={issueId} class="inline-error" role="alert">{issue}</p>{/if}
      </section>
    {/each}
    <button type="button" class="button secondary" onclick={addField}><Plus size={14} /> Add field</button>
  {:else if block.fields.length}
    <table class="config-grid" aria-label="Config fields">
      <colgroup>
        <col class="config-grid-name" />
        {#if block.showDataTypes}<col class="config-grid-type" />{/if}
        <col />
      </colgroup>
      <tbody>
        {#each block.fields as field (field.id)}
          {@const issue = issues.get(field.id)}
          {@const issueId = issue ? editorId + '-error-' + field.id : undefined}
          <tr>
            <th scope="row">{field.name}</th>
            {#if block.showDataTypes}<td class="config-type-label">{configDataTypes[configFieldDataType(field)]}</td>{/if}
            <td>
              {@render fieldControl(field, issueId)}
              {#if issue}<p id={issueId} class="inline-error" role="alert">{issue}</p>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="helper-text">Open the config to add fields.</p>
  {/if}
</div>

{#if creatingPreset}
  {#snippet presetForm()}
    <form id={presetFormId} onsubmit={createPreset}>
      <label class="field">Preset name
        <!-- svelte-ignore a11y_autofocus (Naming the preset is the purpose of this dialog.) -->
        <input maxlength="100" bind:value={presetName} autofocus />
      </label>
      {#if presetError}<p class="inline-error" role="alert">{presetError}</p>{/if}
    </form>
  {/snippet}
  {#snippet presetActions()}
    <button type="button" class="button secondary" onclick={() => creatingPreset = false}>Cancel</button>
    <button type="submit" class="button primary" form={presetFormId} disabled={!presetName.trim() || hasIssues}>Create preset</button>
  {/snippet}
  <Modal title="New preset" close={() => creatingPreset = false} children={presetForm} footer={presetActions} />
{/if}
