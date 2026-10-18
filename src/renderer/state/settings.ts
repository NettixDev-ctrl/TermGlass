import { applySettingsPatch } from '@shared/settings';
import type { Settings } from '@shared/types';
import { api } from '../api';
import { appStore } from './app';

let pending: Partial<Settings> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

/** Applies a settings change immediately (live preview) and persists it shortly after. */
export function updateSettings(patch: Partial<Settings>): void {
  const current = appStore.get().settings;
  const next = applySettingsPatch(current, patch);
  appStore.set((s) => ({ ...s, settings: next }));
  pending = { ...pending, ...patch };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const out = pending;
    pending = {};
    timer = null;
    void api().settings.set(out);
  }, 150);
}

export function resetSettings(): void {
  pending = {};
  if (timer) clearTimeout(timer);
  timer = null;
  void api().settings.reset().then((s) => appStore.set((st) => ({ ...st, settings: s })));
}

/** Settings pushed from the main process; ignored while local edits are still in flight. */
export function receiveSettings(settings: Settings): void {
  if (timer) return;
  if (JSON.stringify(settings) !== JSON.stringify(appStore.get().settings)) appStore.set((s) => ({ ...s, settings }));
}
