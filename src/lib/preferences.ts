export const defaultHotkeys = {
  search: 'Mod+K', runQuery: 'Mod+Enter', undo: 'Mod+Z', redo: 'Mod+Shift+Z', deleteBlock: 'Delete',
  rowAbove: 'Alt+ArrowUp', rowBelow: 'Alt+ArrowDown', columnLeft: 'Alt+ArrowLeft', columnRight: 'Alt+ArrowRight',
};

export type HotkeyAction = keyof typeof defaultHotkeys;
export type Hotkeys = typeof defaultHotkeys;
export type Preferences = {
  theme: 'light' | 'dark' | 'auto';
  confirmHotkeyDelete: boolean;
  hotkeys: Hotkeys;
};

export const defaultPreferences: Preferences = { theme: 'auto', confirmHotkeyDelete: true, hotkeys: defaultHotkeys };

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

export function eventHotkey(event: KeyboardEvent) {
  if (event.isComposing || ['Alt', 'AltGraph', 'Control', 'Meta', 'Shift', 'Unidentified', 'Dead'].includes(event.key)) return '';
  const primary = isMac() ? event.metaKey : event.ctrlKey;
  const secondary = isMac() ? event.ctrlKey : event.metaKey;
  const key = event.code.startsWith('Key') ? event.code.slice(3) : event.key === ' ' ? 'Space' : event.key;
  return [primary && 'Mod', secondary && (isMac() ? 'Ctrl' : 'Meta'), event.altKey && 'Alt', event.shiftKey && 'Shift', key].filter(Boolean).join('+');
}

export function hotkeyLabel(shortcut: string) {
  const labels: Record<string, string> = { Mod: isMac() ? '⌘' : 'Ctrl', Alt: isMac() ? '⌥' : 'Alt',
    Shift: isMac() ? '⇧' : 'Shift', Enter: '↵', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return shortcut.split('+').map((part) => labels[part] ?? part).join(isMac() ? ' ' : '+');
}

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem('dataflow-preferences');
    if (!raw) {
      const theme = localStorage.getItem('dataflow-theme');
      return { ...defaultPreferences, theme: theme === 'light' || theme === 'dark' ? theme : 'auto' };
    }
    const saved = JSON.parse(raw) as Partial<Preferences> | null;
    return {
      theme: saved?.theme === 'light' || saved?.theme === 'dark' ? saved.theme : 'auto',
      confirmHotkeyDelete: saved?.confirmHotkeyDelete !== false,
      hotkeys: Object.fromEntries(Object.entries(defaultHotkeys).map(([action, shortcut]) => {
        const value = saved?.hotkeys?.[action as HotkeyAction];
        return [action, typeof value === 'string' && value ? value : shortcut];
      })) as Hotkeys,
    };
  } catch {
    return defaultPreferences;
  }
}
