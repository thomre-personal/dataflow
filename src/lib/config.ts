import { parseDecimal, validateCell } from './clipboard.ts';
import type { ColumnType, ConfigBlock, ConfigField, ConfigPreset, ConfigValue, ValueType } from './workspace.ts';

export const configFieldTypes = { input: 'Input', slider: 'Slider', multi: 'Multiple choice', toggle: 'Toggle' } as const;
export const configDataTypes = { auto: 'Auto', text: 'Text', decimal: 'Number', date: 'Date', boolean: 'Boolean' } satisfies Record<ColumnType, string>;

export function configFieldDataType(field: ConfigField): ColumnType {
  if (field.type === 'slider') return 'decimal';
  if (field.type === 'toggle') return 'boolean';
  return field.dataType ?? 'auto';
}

export function evaluateConfigField(field: ConfigField): { type: ValueType; value: string | null; message?: undefined } | { message: string } {
  const dataType = configFieldDataType(field);
  if (field.type === 'multi') {
    if (dataType === 'auto' || dataType === 'text') return { type: 'text', value: configValueText(field.value) };
    const selected = new Set(field.value);
    const values: string[] = [];
    for (const option of field.options) {
      const validated = validateCell(option, dataType, 'auto');
      if (validated.message || validated.value == null) return { message: 'Option “' + option + '”. ' + (validated.message ?? 'Enter a value.') };
      if (selected.has(option)) values.push(validated.value);
    }
    return { type: 'text', value: configValueText(values) };
  }

  const raw = configValueText(field.value);
  if (dataType === 'auto') {
    const number = parseDecimal(raw);
    return number === null ? { type: 'text', value: raw } : { type: 'decimal', value: number };
  }
  const validated = validateCell(raw, dataType, field.type === 'slider' ? 'decimal-point' : 'auto');
  return validated.message !== undefined ? { message: validated.message } : { type: dataType, value: validated.value };
}

export function createConfigField(id: string, name: string, type: ConfigField['type']): ConfigField {
  switch (type) {
    case 'input': return { id, name, type, value: '' };
    case 'slider': return { id, name, type, value: 0, min: 0, max: 100, step: 1 };
    case 'toggle': return { id, name, type, value: false };
    case 'multi': return { id, name, type, value: [], options: [] };
  }
}

export function applyConfigValue(field: ConfigField, value: ConfigValue | undefined): ConfigField {
  switch (field.type) {
    case 'input': return typeof value === 'string' ? { ...field, value } : field;
    case 'toggle': return typeof value === 'boolean' ? { ...field, value } : field;
    case 'slider': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return field;
      const bounded = Math.max(field.min, Math.min(field.max, value));
      const steps = Math.round((bounded - field.min) / field.step);
      const snapped = Number((field.min + steps * field.step).toPrecision(15));
      return { ...field, value: Number.isFinite(snapped) ? Math.max(field.min, Math.min(field.max, snapped)) : bounded };
    }
    case 'multi': return Array.isArray(value) ? { ...field, value: field.options.filter((option) => value.includes(option)) } : field;
  }
}

export function loadConfigPreset(config: ConfigBlock, preset: ConfigPreset): { fields: ConfigField[]; message?: undefined } | { message: string } {
  const fields = config.fields.map((field) => applyConfigValue(field, preset.values[field.id]));
  for (const field of fields) {
    const { message } = evaluateConfigField(field);
    if (message) return { message: config.title + ', ' + field.name + ': ' + message };
  }
  return { fields };
}

export function configValueText(value: ConfigValue): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  const text = String(value);
  if (typeof value !== 'number' || !text.includes('e')) return text;
  const [mantissa, exponent] = String(Math.abs(value)).split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  const digits = integer + fraction;
  const offset = integer.length + Number(exponent);
  const sign = value < 0 ? '-' : '';
  if (offset <= 0) return sign + '0.' + '0'.repeat(-offset) + digits;
  if (offset >= digits.length) return sign + digits.padEnd(offset, '0');
  return sign + digits.slice(0, offset) + '.' + digits.slice(offset);
}
