<script lang="ts">
  import type { ConfigBlock, SwitchBlock, SwitchOption } from '../lib/workspace';

  let { block, configs, candidates, connect, change }: {
    block: SwitchBlock;
    configs: ConfigBlock[];
    candidates: ConfigBlock[];
    connect: (id: string) => void;
    change: (patch: Partial<SwitchBlock>) => void;
  } = $props();

  const optionLabels = ['A', 'B'];
  let availablePresets = $derived(new Map(configs.map((config) => [config.id, new Set(config.presets.map(({ id }) => id))])));
  let hasUnavailablePresets = $derived(block.options.some((option) =>
    option.presets.some(({ configId, presetId }) => !availablePresets.get(configId)?.has(presetId))));

  function updateOption(index: number, option: SwitchOption) {
    const options: SwitchBlock['options'] = [...block.options];
    options[index] = option;
    change({ options, active: undefined });
  }

  function renameOption(index: number, input: HTMLInputElement) {
    const option = block.options[index];
    const name = input.value.trim() || option.label;
    input.value = name;
    if (name !== option.label) updateOption(index, { ...option, label: name });
  }

  function choosePreset(index: number, configId: string, presetId: string) {
    const option = block.options[index];
    const presets = option.presets.filter((item) => item.configId !== configId);
    if (presetId) presets.push({ configId, presetId });
    updateOption(index, { ...option, presets });
  }

  function removeUnavailablePresets() {
    const clean = (option: SwitchOption) => ({
      ...option, presets: option.presets.filter(({ configId, presetId }) => availablePresets.get(configId)?.has(presetId)),
    });
    change({ options: [clean(block.options[0]), clean(block.options[1])], active: undefined });
  }
</script>

<div class="switch-editor">
  {#if candidates.length}
    <label class="field">Connect config<select value="" onchange={(event) => {
      if (event.currentTarget.value) connect(event.currentTarget.value);
      event.currentTarget.value = '';
    }}>
      <option value="">Choose a config</option>
      {#each candidates as config (config.id)}<option value={config.id}>{config.title}</option>{/each}
    </select></label>
  {/if}
  <div class="switch-options">
    {#each block.options as option, index}
      <label class="field">Option {optionLabels[index]}<input maxlength="100" value={option.label}
        onchange={(event) => renameOption(index, event.currentTarget)} /></label>
    {/each}
  </div>
  {#each configs as config (config.id)}
    <fieldset class="switch-presets" aria-label={config.title}>
      <legend>{config.title}{config.global ? ' · Global' : ''}</legend>
      <div class="switch-options">
        {#each block.options as option, index}
          <label class="field">Preset for {option.label}
            <select value={option.presets.find(({ configId }) => configId === config.id)?.presetId ?? ''}
              onchange={(event) => choosePreset(index, config.id, event.currentTarget.value)}>
              <option value="">Keep current values</option>
              {#each config.presets as preset (preset.id)}<option value={preset.id}>{preset.name}</option>{/each}
            </select>
          </label>
        {/each}
      </div>
    </fieldset>
  {:else}
    <p class="helper-text">Connect a config or make one global to choose its presets.</p>
  {/each}
  {#if hasUnavailablePresets}
    <button type="button" class="button secondary" onclick={removeUnavailablePresets}>Remove unavailable presets</button>
  {/if}
</div>
