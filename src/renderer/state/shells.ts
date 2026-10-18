import type { CustomShell, ShellInfo, ShellListResult } from '@shared/types';
import { api } from '../api';
import { appStore, showToast } from './app';
import { updateSettings } from './settings';

export const shellById = (id: string | null | undefined): ShellInfo | undefined => (id ? appStore.get().shellList.shells.find((s) => s.id === id) : undefined);

export function receiveShells(result: ShellListResult): void {
  appStore.set((s) => ({ ...s, shellList: result }));
}

/** Rescans the system for installed shells (done by the main process). */
export async function refreshShells(): Promise<ShellListResult> {
  const result = await api().shells.refresh();
  receiveShells(result);
  return result;
}

export function setDefaultShell(id: string): void {
  updateSettings({ shellId: id });
  const name = id === 'auto' ? 'the system default' : (shellById(id)?.name ?? id);
  showToast(id === 'auto' ? 'New sessions use the system default shell' : `New sessions will start ${name}`);
}

export function setShellArgs(id: string, text: string): void {
  const current = appStore.get().settings.shellArgs;
  const next = { ...current };
  if (text.trim()) next[id] = text;
  else delete next[id];
  updateSettings({ shellArgs: next });
}

const randomId = () => `custom-${Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, 'x')}`;

export function addCustomShell(path: string, name?: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop()?.replace(/\.exe$/i, '') ?? 'shell';
  const entry: CustomShell = { id: randomId(), name: (name ?? base).slice(0, 40) || 'Custom shell', path: path.trim() };
  updateSettings({ customShells: [...appStore.get().settings.customShells, entry] });
  return entry.id;
}

export function updateCustomShell(id: string, patch: Partial<Pick<CustomShell, 'name' | 'path'>>): void {
  updateSettings({ customShells: appStore.get().settings.customShells.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
}

export function removeCustomShell(id: string): void {
  const { settings } = appStore.get();
  const { [id]: _args, ...shellArgs } = settings.shellArgs;
  updateSettings({
    customShells: settings.customShells.filter((c) => c.id !== id),
    shellArgs,
    ...(settings.shellId === id ? { shellId: 'auto' } : {})
  });
}
