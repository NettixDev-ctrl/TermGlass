import { isValidColor, mix, withAlpha } from './color';
import type { TerminalColors, Theme, UiColors } from './types';

type Ansi = Omit<TerminalColors, 'background' | 'foreground' | 'cursor' | 'cursorAccent' | 'selectionBackground'>;

const DARK_ANSI: Ansi = {
  black: '#2e2e33',
  red: '#ff6b72',
  green: '#8ad9a3',
  yellow: '#f0c674',
  blue: '#6ea8ff',
  magenta: '#c792ea',
  cyan: '#6fd3d6',
  white: '#d4d4d8',
  brightBlack: '#8a8a94',
  brightRed: '#ff8f94',
  brightGreen: '#a6e8ba',
  brightYellow: '#f7d794',
  brightBlue: '#93bfff',
  brightMagenta: '#dbb2f5',
  brightCyan: '#96e4e6',
  brightWhite: '#fafafa'
};

const LIGHT_ANSI: Ansi = {
  black: '#1d1d1f',
  red: '#c4262e',
  green: '#1e7a3c',
  yellow: '#8a5d00',
  blue: '#0a5bd6',
  magenta: '#8e3fc0',
  cyan: '#00717a',
  white: '#6a6a72',
  brightBlack: '#5e5e66',
  brightRed: '#d63a42',
  brightGreen: '#2a8a4a',
  brightYellow: '#9a6a00',
  brightBlue: '#2a72e8',
  brightMagenta: '#a050d0',
  brightCyan: '#0e808a',
  brightWhite: '#34343a'
};

function theme(
  id: string,
  name: string,
  type: Theme['type'],
  ui: UiColors,
  terminal: Omit<TerminalColors, keyof Ansi>,
  ansi: Ansi,
  minimumContrastRatio: number
): Theme {
  return { id, name, type, ui, terminal: { ...terminal, ...ansi }, minimumContrastRatio, builtin: true };
}

export const BUILTIN_THEMES: Theme[] = [
  theme(
    'termglass-dark',
    'TermGlass Dark',
    'dark',
    { background: '#0b0b0d', surface: '#151518', foreground: '#e8e8ea', muted: '#8d8d96', border: 'rgba(255, 255, 255, 0.08)', accent: '#6aa4ff' },
    { background: '#0b0b0d', foreground: '#e8e8ea', cursor: '#f2f2f4', cursorAccent: '#0b0b0d', selectionBackground: 'rgba(106, 164, 255, 0.30)' },
    DARK_ANSI,
    3
  ),
  theme(
    'termglass-light',
    'TermGlass Light',
    'light',
    { background: '#fbfbfc', surface: '#f0f0f3', foreground: '#1d1d1f', muted: '#6a6a72', border: 'rgba(0, 0, 0, 0.10)', accent: '#0a64d8' },
    { background: '#fbfbfc', foreground: '#1d1d1f', cursor: '#1d1d1f', cursorAccent: '#fbfbfc', selectionBackground: 'rgba(10, 100, 216, 0.22)' },
    LIGHT_ANSI,
    4.5
  ),
  theme(
    'oled-black',
    'OLED Black',
    'dark',
    { background: '#000000', surface: '#0c0c0d', foreground: '#f0f0f2', muted: '#8a8a92', border: 'rgba(255, 255, 255, 0.10)', accent: '#5fa0ff' },
    { background: '#000000', foreground: '#f0f0f2', cursor: '#ffffff', cursorAccent: '#000000', selectionBackground: 'rgba(95, 160, 255, 0.32)' },
    { ...DARK_ANSI, black: '#35353a', brightBlack: '#8e8e98' },
    3
  ),
  theme(
    'graphite',
    'Graphite',
    'dark',
    { background: '#1b1c20', surface: '#25262b', foreground: '#dcdde2', muted: '#9294a0', border: 'rgba(255, 255, 255, 0.09)', accent: '#7fa6e8' },
    { background: '#1b1c20', foreground: '#dcdde2', cursor: '#e8e9ee', cursorAccent: '#1b1c20', selectionBackground: 'rgba(127, 166, 232, 0.30)' },
    {
      black: '#34353b',
      red: '#e8777c',
      green: '#8fc9a0',
      yellow: '#dcc07a',
      blue: '#7fa6e8',
      magenta: '#b99ae0',
      cyan: '#78c4c9',
      white: '#c8c9cf',
      brightBlack: '#8c8e9a',
      brightRed: '#f09a9e',
      brightGreen: '#aedcbb',
      brightYellow: '#ead59b',
      brightBlue: '#a2c0f0',
      brightMagenta: '#cfb8ec',
      brightCyan: '#9cd6da',
      brightWhite: '#f4f4f7'
    },
    3
  ),
  theme(
    'frost',
    'Frost',
    'light',
    { background: '#eef3f8', surface: '#e3eaf2', foreground: '#1c2733', muted: '#556678', border: 'rgba(20, 40, 70, 0.13)', accent: '#2a78c8' },
    { background: '#eef3f8', foreground: '#1c2733', cursor: '#1c2733', cursorAccent: '#eef3f8', selectionBackground: 'rgba(42, 120, 200, 0.22)' },
    {
      black: '#1c2733',
      red: '#b8262f',
      green: '#1c7440',
      yellow: '#80570a',
      blue: '#0c58b8',
      magenta: '#7c3fb0',
      cyan: '#0a6a78',
      white: '#566474',
      brightBlack: '#4f5f70',
      brightRed: '#cc3a42',
      brightGreen: '#2a8450',
      brightYellow: '#946508',
      brightBlue: '#2670d0',
      brightMagenta: '#9150c4',
      brightCyan: '#167a88',
      brightWhite: '#2e3b4a'
    },
    4.5
  )
];

export const DEFAULT_THEME_ID = 'termglass-dark';

const TERMINAL_KEYS: (keyof TerminalColors)[] = [
  'background', 'foreground', 'cursor', 'cursorAccent', 'selectionBackground',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
];
const UI_KEYS: (keyof UiColors)[] = ['background', 'surface', 'foreground', 'muted', 'border', 'accent'];

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;

export function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

/**
 * Validates a custom theme JSON document. Missing colours fall back to the built-in theme of the same
 * `type`, UI colours not given explicitly are derived from the terminal palette. Throws with a readable
 * message on invalid input.
 */
export function parseCustomTheme(raw: unknown, fallbackId: string): Theme {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Theme must be a JSON object.');
  const obj = raw as Record<string, unknown>;

  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 60) : fallbackId;
  const id = slugify(typeof obj.id === 'string' && obj.id ? obj.id : fallbackId);
  if (!ID_RE.test(id)) throw new Error(`Invalid theme id "${String(obj.id ?? fallbackId)}".`);
  if (BUILTIN_THEMES.some((t) => t.id === id)) throw new Error(`Theme id "${id}" is reserved by a built-in theme.`);
  if (obj.type !== 'dark' && obj.type !== 'light') throw new Error('"type" must be "dark" or "light".');
  const type: Theme['type'] = obj.type;
  const base = BUILTIN_THEMES.find((t) => t.id === (type === 'dark' ? 'termglass-dark' : 'termglass-light'))!;

  const termIn = (typeof obj.terminal === 'object' && obj.terminal !== null ? obj.terminal : {}) as Record<string, unknown>;
  const uiIn = (typeof obj.ui === 'object' && obj.ui !== null ? obj.ui : {}) as Record<string, unknown>;

  const terminal = { ...base.terminal };
  for (const key of TERMINAL_KEYS) {
    const v = termIn[key];
    if (v === undefined) continue;
    if (!isValidColor(v)) throw new Error(`terminal.${key} is not a valid colour: ${JSON.stringify(v)}`);
    terminal[key] = v;
  }
  if (termIn.cursorAccent === undefined) terminal.cursorAccent = terminal.background;
  if (termIn.cursor === undefined) terminal.cursor = terminal.foreground;

  const accentGuess = isValidColor(uiIn.accent) ? uiIn.accent : terminal.blue;
  const derived: UiColors = {
    background: terminal.background,
    surface: mix(terminal.background, terminal.foreground, type === 'dark' ? 0.06 : 0.05),
    foreground: terminal.foreground,
    muted: mix(terminal.foreground, terminal.background, 0.42),
    border: withAlpha(terminal.foreground, type === 'dark' ? 0.09 : 0.12),
    accent: accentGuess
  };
  const ui = { ...derived };
  for (const key of UI_KEYS) {
    const v = uiIn[key];
    if (v === undefined) continue;
    if (!isValidColor(v)) throw new Error(`ui.${key} is not a valid colour: ${JSON.stringify(v)}`);
    ui[key] = v;
  }

  let minimumContrastRatio = base.minimumContrastRatio;
  if (obj.minimumContrastRatio !== undefined) {
    const n = Number(obj.minimumContrastRatio);
    if (!Number.isFinite(n) || n < 1 || n > 21) throw new Error('"minimumContrastRatio" must be between 1 and 21.');
    minimumContrastRatio = n;
  }

  return { id, name, type, ui, terminal, minimumContrastRatio, builtin: false };
}
