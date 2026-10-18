import type { Platform } from './types';

export interface CommandDef {
  id: string;
  title: string;
  category: 'Tabs' | 'Panes' | 'Shell' | 'Terminal' | 'View' | 'Application';
  /** Default shortcut(s) per platform; alternatives are separated by "|". */
  keys: { linux: string; win32: string; darwin: string };
  /** Shown in the settings shortcut editor and the command palette. */
  customizable?: boolean;
}

const same = (k: string): CommandDef['keys'] => ({ linux: k, win32: k, darwin: k });
const lw = (k: string, mac: string): CommandDef['keys'] => ({ linux: k, win32: k, darwin: mac });

export const COMMANDS: CommandDef[] = [
  { id: 'palette.open', title: 'Command Palette', category: 'Application', keys: lw('Ctrl+Shift+P', 'Shift+Meta+P') },
  { id: 'settings.open', title: 'Open Settings', category: 'Application', keys: lw('Ctrl+,', 'Meta+,') },
  { id: 'tab.new', title: 'New Tab', category: 'Tabs', keys: lw('Ctrl+Shift+T', 'Meta+T') },
  { id: 'tab.close', title: 'Close Tab', category: 'Tabs', keys: lw('Ctrl+Alt+W', 'Shift+Meta+W') },
  { id: 'tab.next', title: 'Next Tab', category: 'Tabs', keys: lw('Ctrl+Tab|Ctrl+PageDown', 'Ctrl+Tab|Shift+Meta+]') },
  { id: 'tab.prev', title: 'Previous Tab', category: 'Tabs', keys: lw('Ctrl+Shift+Tab|Ctrl+PageUp', 'Ctrl+Shift+Tab|Shift+Meta+[') },
  { id: 'tab.rename', title: 'Rename Tab', category: 'Tabs', keys: lw('Ctrl+Shift+R', 'Shift+Meta+R') },
  { id: 'tab.duplicate', title: 'Duplicate Tab', category: 'Tabs', keys: same('') },
  { id: 'tab.closeOthers', title: 'Close Other Tabs', category: 'Tabs', keys: same('') },
  { id: 'tab.closeRight', title: 'Close Tabs to the Right', category: 'Tabs', keys: same('') },
  { id: 'pane.splitRight', title: 'Split Right', category: 'Panes', keys: lw('Ctrl+Shift+D', 'Meta+D') },
  { id: 'pane.splitDown', title: 'Split Down', category: 'Panes', keys: lw('Ctrl+Shift+E', 'Shift+Meta+D') },
  { id: 'pane.close', title: 'Close Pane', category: 'Panes', keys: lw('Ctrl+Shift+W', 'Meta+W') },
  { id: 'pane.focusLeft', title: 'Focus Pane Left', category: 'Panes', keys: lw('Alt+Shift+ArrowLeft', 'Alt+Meta+ArrowLeft') },
  { id: 'pane.focusRight', title: 'Focus Pane Right', category: 'Panes', keys: lw('Alt+Shift+ArrowRight', 'Alt+Meta+ArrowRight') },
  { id: 'pane.focusUp', title: 'Focus Pane Above', category: 'Panes', keys: lw('Alt+Shift+ArrowUp', 'Alt+Meta+ArrowUp') },
  { id: 'pane.focusDown', title: 'Focus Pane Below', category: 'Panes', keys: lw('Alt+Shift+ArrowDown', 'Alt+Meta+ArrowDown') },
  { id: 'pane.focusNext', title: 'Focus Next Pane', category: 'Panes', keys: lw('Ctrl+Shift+]', 'Meta+]') },
  { id: 'pane.focusPrev', title: 'Focus Previous Pane', category: 'Panes', keys: lw('Ctrl+Shift+[', 'Meta+[') },
  { id: 'pane.restart', title: 'Restart Shell in Pane', category: 'Panes', keys: same('') },
  { id: 'shell.selector', title: 'Switch Shell…', category: 'Shell', keys: lw('Ctrl+Shift+S', 'Shift+Meta+S') },
  { id: 'shell.newTabWith', title: 'New Tab with Shell…', category: 'Shell', keys: same('') },
  { id: 'shell.refresh', title: 'Rescan Installed Shells', category: 'Shell', keys: same('') },
  { id: 'term.copy', title: 'Copy', category: 'Terminal', keys: lw('Ctrl+Shift+C', 'Meta+C') },
  { id: 'term.paste', title: 'Paste', category: 'Terminal', keys: lw('Ctrl+Shift+V', 'Meta+V') },
  { id: 'term.selectAll', title: 'Select All', category: 'Terminal', keys: lw('Ctrl+Shift+A', 'Meta+A') },
  { id: 'term.clear', title: 'Clear Scrollback', category: 'Terminal', keys: lw('Ctrl+Shift+K', 'Meta+K') },
  { id: 'term.find', title: 'Find in Terminal', category: 'Terminal', keys: lw('Ctrl+Shift+F', 'Meta+F') },
  { id: 'term.zoomIn', title: 'Increase Font Size', category: 'Terminal', keys: lw('Ctrl+=|Ctrl+Shift+=', 'Meta+=|Shift+Meta+=') },
  { id: 'term.zoomOut', title: 'Decrease Font Size', category: 'Terminal', keys: lw('Ctrl+-', 'Meta+-') },
  { id: 'term.zoomReset', title: 'Reset Font Size', category: 'Terminal', keys: lw('Ctrl+0', 'Meta+0') },
  { id: 'sidebar.toggle', title: 'Toggle Sidebar', category: 'View', keys: lw('Ctrl+Shift+B', 'Shift+Meta+B') },
  { id: 'statusbar.toggle', title: 'Toggle Status Bar', category: 'View', keys: same('') },
  { id: 'window.fullscreen', title: 'Toggle Full Screen', category: 'View', keys: lw('F11', 'Ctrl+Meta+F') },
  { id: 'window.devtools', title: 'Toggle Developer Tools', category: 'Application', keys: lw('Ctrl+Shift+I', 'Alt+Meta+I') },
  { id: 'app.quit', title: 'Quit TermGlass', category: 'Application', keys: lw('Ctrl+Shift+Q', 'Meta+Q') }
];

export const COMMAND_IDS = new Set(COMMANDS.map((c) => c.id));

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;

/** Physical-key names for event.code values that are not letters or digits. */
const CODE_NAMES: Record<string, string> = {
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '=', Backquote: '`', Space: 'Space', NumpadAdd: '=', NumpadSubtract: '-'
};

export interface KeyEventLike {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export function keyNameFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return code.slice(6);
  if (code in CODE_NAMES) return CODE_NAMES[code]!;
  if (/^(Arrow(Left|Right|Up|Down)|Tab|Enter|Escape|Backspace|Delete|Insert|Home|End|PageUp|PageDown|F\d{1,2})$/.test(code)) return code;
  return null;
}

/** Canonical combo string for a keyboard event, e.g. "Ctrl+Shift+T". Returns null for pure modifier presses. */
export function comboFromEvent(e: KeyEventLike): string | null {
  const name = keyNameFromCode(e.code);
  if (!name) return null;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean) as string[];
  return [...MODIFIER_ORDER.filter((m) => mods.includes(m)), name].join('+');
}

export function defaultKeys(def: CommandDef, platform: Platform): string {
  return def.keys[platform];
}

/** Effective shortcut string for a command: user override or platform default. */
export function effectiveKeys(def: CommandDef, overrides: Record<string, string>, platform: Platform): string {
  return Object.prototype.hasOwnProperty.call(overrides, def.id) ? overrides[def.id]! : defaultKeys(def, platform);
}

export function splitAlternatives(keys: string): string[] {
  return keys.split('|').map((s) => s.trim()).filter(Boolean);
}

/** Builds a lookup from canonical combo to command id. Later bindings never override earlier ones. */
export function buildKeyMap(overrides: Record<string, string>, platform: Platform): Map<string, string> {
  const map = new Map<string, string>();
  // User overrides win over defaults, so process them first.
  const ordered = [...COMMANDS].sort((a, b) => Number(overrides[b.id] !== undefined) - Number(overrides[a.id] !== undefined));
  for (const def of ordered) {
    for (const combo of splitAlternatives(effectiveKeys(def, overrides, platform))) {
      if (!map.has(combo)) map.set(combo, def.id);
    }
  }
  return map;
}

const DISPLAY: Record<string, { mac: string; other: string }> = {
  Ctrl: { mac: '⌃', other: 'Ctrl' },
  Alt: { mac: '⌥', other: 'Alt' },
  Shift: { mac: '⇧', other: 'Shift' },
  Meta: { mac: '⌘', other: 'Meta' }
};
const KEY_DISPLAY: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', PageUp: 'PgUp', PageDown: 'PgDn' };

export function formatCombo(combo: string, platform: Platform): string {
  const mac = platform === 'darwin';
  const parts = combo.split('+');
  const last = parts[parts.length - 1]!;
  const mods = parts.slice(0, -1);
  const shown = mods.map((m) => DISPLAY[m]?.[mac ? 'mac' : 'other'] ?? m);
  const key = KEY_DISPLAY[last] ?? last;
  return mac ? [...shown, key].join('') : [...shown, key].join('+');
}

export function formatKeys(keys: string, platform: Platform): string {
  return splitAlternatives(keys).map((c) => formatCombo(c, platform)).join(' / ');
}

const KNOWN_KEYS = new Set<string>([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
  ...Object.values(CODE_NAMES),
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`)
]);

/** True for "" (disabled) or one or more "|"-separated canonical combos. */
export function isValidKeys(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false;
  if (value === '') return true;
  return splitAlternatives(value).every((combo) => {
    const parts = combo.split('+');
    const key = parts.pop();
    if (!key || !KNOWN_KEYS.has(key)) return false;
    const mods = parts as string[];
    const canonical = MODIFIER_ORDER.filter((m) => mods.includes(m));
    return mods.length === canonical.length && mods.every((m, i) => m === canonical[i]) && new Set(mods).size === mods.length;
  });
}
