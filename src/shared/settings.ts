import { isValidColor } from './color';
import { DEFAULT_THEME_ID } from './themes';
import { COMMAND_IDS, isValidKeys } from './keybindings';
import { MAX_SHELL_ARGS_TEXT } from './shell-args';
import type { ConfirmClose, CursorShape, CustomShell, MotionPref, Platform, Settings } from './types';

export const SETTING_LIMITS = {
  fontSize: { min: 8, max: 32 },
  lineHeight: { min: 1, max: 2 },
  scrollback: { min: 0, max: 100_000 },
  windowOpacity: { min: 0.5, max: 1 },
  glassBlur: { min: 0, max: 24 }
} as const;

export function defaultSettings(platform: Platform): Settings {
  return {
    themeId: DEFAULT_THEME_ID,
    accent: null,
    fontFamily: 'JetBrains Mono',
    fontSize: 13,
    lineHeight: 1.2,
    cursorShape: 'bar',
    cursorBlink: true,
    scrollback: 10_000,
    copyOnSelect: false,
    gpuRendering: true,
    shellId: 'auto',
    loginShell: platform === 'darwin',
    customShells: [],
    shellArgs: {},
    cwd: '',
    confirmClose: 'running',
    windowOpacity: 1,
    windowBlur: false,
    glassBlur: 14,
    translucentWindow: true,
    animations: 'full',
    showStatusBar: true,
    sidebarOpen: false,
    keybindings: {}
  };
}

const num = (v: unknown, min: number, max: number, fallback: number, integer = false): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  const c = Math.min(max, Math.max(min, v));
  return integer ? Math.round(c) : Math.round(c * 100) / 100;
};
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const str = (v: unknown, max: number, fallback: string) => (typeof v === 'string' && v.length <= max ? v : fallback);

const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const CUSTOM_ID_RE = /^custom-[a-z0-9]{1,16}$/;
export const MAX_CUSTOM_SHELLS = 16;
/** Absolute POSIX path, Windows drive path or UNC path. */
const ABS_PATH_RE = /^(\/|[A-Za-z]:[\\/]|\\\\)/;

export function isAbsoluteExecutablePath(p: string): boolean {
  return p.length > 0 && p.length <= 1024 && !/[\0\r\n]/.test(p) && ABS_PATH_RE.test(p);
}

function sanitizeCustomShells(input: unknown, fallback: CustomShell[]): CustomShell[] {
  if (!Array.isArray(input)) return fallback;
  const out: CustomShell[] = [];
  const ids = new Set<string>();
  for (const item of input.slice(0, MAX_CUSTOM_SHELLS)) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name, path } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !CUSTOM_ID_RE.test(id) || ids.has(id)) continue;
    if (typeof path !== 'string' || !isAbsoluteExecutablePath(path.trim())) continue;
    const cleanName = typeof name === 'string' ? name.replace(/[\r\n\0]/g, ' ').trim().slice(0, 40) : '';
    ids.add(id);
    out.push({ id, name: cleanName || 'Custom shell', path: path.trim() });
  }
  return out;
}

function sanitizeShellArgs(input: unknown, fallback: Record<string, string>): Record<string, string> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fallback;
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(input)) {
    if (!ID_RE.test(id) || typeof value !== 'string' || value.length > MAX_SHELL_ARGS_TEXT || /[\0\r\n]/.test(value)) continue;
    if (value.trim()) out[id] = value;
  }
  return out;
}
const FONT_RE = /^[^;{}<>\\\n\r]{1,200}$/;

/**
 * Coerces untrusted input (settings file or IPC payload) into a valid Settings object.
 * Unknown keys are dropped and every value is type-checked and clamped; invalid values keep `base`.
 */
export function sanitizeSettings(raw: unknown, base: Settings): Settings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...base, keybindings: { ...base.keybindings } };
  const r = raw as Record<string, unknown>;
  const L = SETTING_LIMITS;

  const keybindings: Record<string, string> = {};
  const kbIn = 'keybindings' in r ? r.keybindings : base.keybindings;
  if (typeof kbIn === 'object' && kbIn !== null && !Array.isArray(kbIn)) {
    for (const [id, keys] of Object.entries(kbIn)) {
      if (COMMAND_IDS.has(id) && isValidKeys(keys)) keybindings[id] = keys;
    }
  }

  const themeId = typeof r.themeId === 'string' && ID_RE.test(r.themeId) ? r.themeId : base.themeId;
  const accent = r.accent === null ? null : isValidColor(r.accent) ? r.accent : base.accent;
  const shellId = typeof r.shellId === 'string' && (r.shellId === 'auto' || ID_RE.test(r.shellId)) ? r.shellId : base.shellId;
  const fontFamily = typeof r.fontFamily === 'string' && FONT_RE.test(r.fontFamily.trim()) ? r.fontFamily.trim() : base.fontFamily;

  return {
    themeId,
    accent,
    fontFamily,
    fontSize: num(r.fontSize, L.fontSize.min, L.fontSize.max, base.fontSize, true),
    lineHeight: num(r.lineHeight, L.lineHeight.min, L.lineHeight.max, base.lineHeight),
    cursorShape: oneOf<CursorShape>(r.cursorShape, ['block', 'underline', 'bar'], base.cursorShape),
    cursorBlink: bool(r.cursorBlink, base.cursorBlink),
    scrollback: num(r.scrollback, L.scrollback.min, L.scrollback.max, base.scrollback, true),
    copyOnSelect: bool(r.copyOnSelect, base.copyOnSelect),
    gpuRendering: bool(r.gpuRendering, base.gpuRendering),
    shellId,
    loginShell: bool(r.loginShell, base.loginShell),
    customShells: 'customShells' in r ? sanitizeCustomShells(r.customShells, base.customShells) : base.customShells,
    shellArgs: 'shellArgs' in r ? sanitizeShellArgs(r.shellArgs, base.shellArgs) : base.shellArgs,
    cwd: str(r.cwd, 1024, base.cwd),
    confirmClose: oneOf<ConfirmClose>(r.confirmClose, ['running', 'always', 'never'], base.confirmClose),
    windowOpacity: num(r.windowOpacity, L.windowOpacity.min, L.windowOpacity.max, base.windowOpacity),
    windowBlur: bool(r.windowBlur, base.windowBlur),
    glassBlur: num(r.glassBlur, L.glassBlur.min, L.glassBlur.max, base.glassBlur, true),
    translucentWindow: bool(r.translucentWindow, base.translucentWindow),
    animations: oneOf<MotionPref>(r.animations, ['full', 'reduced', 'off'], base.animations),
    showStatusBar: bool(r.showStatusBar, base.showStatusBar),
    sidebarOpen: bool(r.sidebarOpen, base.sidebarOpen),
    keybindings
  };
}

/** Validates a partial update coming over IPC against the current settings. */
export function applySettingsPatch(current: Settings, patch: unknown): Settings {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return current;
  return sanitizeSettings({ ...current, ...(patch as object) }, current);
}
