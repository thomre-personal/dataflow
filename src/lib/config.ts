import type { ConfigField, ConfigValue } from './workspace.ts';

export const configFieldTypes = { input: 'Input', slider: 'Slider', multi: 'Multiple choice', toggle: 'Toggle' } as const;

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
