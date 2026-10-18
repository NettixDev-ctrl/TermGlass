import { BUILTIN_THEMES, DEFAULT_THEME_ID } from '@shared/themes';
import { defaultSettings } from '@shared/settings';
import type { AppInfo, Settings, ShellListResult, Theme, ThemeLoadError, WindowState } from '@shared/types';
import { createStore } from './store';

export interface AppState {
  info: AppInfo;
  settings: Settings;
  customThemes: Theme[];
  themeErrors: ThemeLoadError[];
  shellList: ShellListResult;
  window: WindowState;
}

const placeholderInfo: AppInfo = {
  platform: 'linux',
  version: '0.0.0',
  electron: '',
  chrome: '',
  homedir: '',
  userDataDir: '',
  themesDir: '',
  translucent: false,
  roundedWindow: false,
  windowBlurSupported: false,
  devMode: false,
  nerdFonts: []
};

export const appStore = createStore<AppState>({
  info: placeholderInfo,
  settings: defaultSettings('linux'),
  customThemes: [],
  themeErrors: [],
  shellList: { shells: [], systemDefaultId: null, problems: [] },
  window: { maximized: false, fullscreen: false, focused: true }
});

export function allThemes(state: Pick<AppState, 'customThemes'>): Theme[] {
  return [...BUILTIN_THEMES, ...state.customThemes];
}

export function resolveTheme(state: Pick<AppState, 'customThemes' | 'settings'>): Theme {
  const all = allThemes(state);
  return all.find((t) => t.id === state.settings.themeId) ?? all.find((t) => t.id === DEFAULT_THEME_ID)!;
}

export type SettingsSection = 'appearance' | 'terminal' | 'shell' | 'keyboard' | 'themes' | 'about';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  run?: () => void;
}

export interface UiState {
  palette: boolean;
  settings: { open: boolean; section: SettingsSection };
  confirm: ConfirmRequest | null;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  renamingTab: string | null;
  /** Pane whose find bar is open. */
  find: string | null;
  /** Shell selector popover. `switch` replaces the active pane's shell, `new-tab` opens a tab with the chosen shell. */
  shellPicker: { mode: 'switch' | 'new-tab'; left: number; edge: number; placement: 'above' | 'below' } | null;
  toast: { id: number; text: string } | null;
}

export const uiStore = createStore<UiState>({
  palette: false,
  settings: { open: false, section: 'appearance' },
  confirm: null,
  menu: null,
  renamingTab: null,
  find: null,
  shellPicker: null,
  toast: null
});

export const overlayOpen = (u: UiState) => u.palette || u.settings.open || u.confirm !== null || u.shellPicker !== null;

export function askConfirm(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  // A pending confirmation is cancelled by a newer one.
  uiStore.get().confirm?.resolve(false);
  return new Promise((resolve) => {
    uiStore.set((u) => ({ ...u, confirm: { ...opts, resolve: (ok) => { uiStore.set((s) => ({ ...s, confirm: null })); resolve(ok); } } }));
  });
}

let toastId = 0;
export function showToast(text: string): void {
  const id = ++toastId;
  uiStore.set((u) => ({ ...u, toast: { id, text } }));
  setTimeout(() => {
    if (uiStore.get().toast?.id === id) uiStore.set((u) => ({ ...u, toast: null }));
  }, 4000);
}

export function openSettings(section?: SettingsSection): void {
  uiStore.set((u) => ({ ...u, palette: false, menu: null, settings: { open: true, section: section ?? u.settings.section } }));
}
export function closeSettings(): void {
  uiStore.set((u) => ({ ...u, settings: { ...u.settings, open: false } }));
}
export function togglePalette(open?: boolean): void {
  uiStore.set((u) => ({ ...u, menu: null, settings: { ...u.settings, open: open === undefined ? u.settings.open && !u.palette : u.settings.open && !open }, palette: open ?? !u.palette }));
}
export function showMenu(x: number, y: number, items: MenuItem[]): void {
  uiStore.set((u) => ({ ...u, menu: { x, y, items } }));
}
export function hideMenu(): void {
  if (uiStore.get().menu) uiStore.set((u) => ({ ...u, menu: null }));
}

/**
 * Opens the shell selector. `anchor` is the element's bounding box; the popover opens above it (status bar)
 * or below it (title bar). Without an anchor it appears at the bottom-left corner of the window.
 */
export function showShellPicker(mode: 'switch' | 'new-tab', anchor?: { left: number; top: number; bottom: number }, placement: 'above' | 'below' = 'above'): void {
  const a = anchor ?? (placement === 'above' ? { left: 12, top: window.innerHeight - 30, bottom: window.innerHeight } : { left: 90, top: 0, bottom: 44 });
  uiStore.set((u) => ({
    ...u,
    palette: false,
    menu: null,
    shellPicker: { mode, left: a.left, edge: placement === 'above' ? window.innerHeight - a.top : a.bottom, placement }
  }));
}
export function hideShellPicker(): void {
  if (uiStore.get().shellPicker) uiStore.set((u) => ({ ...u, shellPicker: null }));
}
