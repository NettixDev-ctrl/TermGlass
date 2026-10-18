import { api } from '../api';
import { registry } from '../terminal/registry';
import type { SessionCallbacks, SessionOptions } from '../terminal/TerminalSession';
import { appStore, askConfirm, showToast, uiStore } from './app';
import { shellById } from './shells';
import { createStore } from './store';
import {
  cycleLeaf,
  findNeighbor,
  hasLeaf,
  leaves,
  mapLeaves,
  removeLeaf,
  setRatio,
  splitLeaf,
  type Direction,
  type PaneNode,
  type SplitDir
} from './layout';

export interface Tab {
  id: string;
  /** User-chosen name; null means "follow the active pane's title". */
  customTitle: string | null;
  root: PaneNode;
  activePane: string;
}

export interface WorkspaceState {
  tabs: Tab[];
  activeTabId: string | null;
}

export interface PaneMeta {
  title: string;
  cwd: string | null;
  shell: string | null;
  shellId: string | null;
  cols: number;
  rows: number;
  exited: boolean;
}

export const workspaceStore = createStore<WorkspaceState>({ tabs: [], activeTabId: null });
export const paneMetaStore = createStore<Record<string, PaneMeta>>({});

const uuid = () => crypto.randomUUID();
const emptyMeta: PaneMeta = { title: '', cwd: null, shell: null, shellId: null, cols: 0, rows: 0, exited: false };

function setMeta(id: string, patch: Partial<PaneMeta>): void {
  paneMetaStore.set((m) => {
    const cur = m[id];
    if (!cur) return m;
    const next = { ...cur, ...patch };
    if (Object.keys(patch).every((k) => cur[k as keyof PaneMeta] === next[k as keyof PaneMeta])) return m;
    return { ...m, [id]: next };
  });
}

function dropMeta(id: string): void {
  paneMetaStore.set((m) => {
    if (!(id in m)) return m;
    const { [id]: _removed, ...rest } = m;
    return rest;
  });
}

// ---- session callbacks ---------------------------------------------------------------------

const callbacks: SessionCallbacks = {
  onTitle: (id, title) => setMeta(id, { title: title.trim() }),
  onCwd: (id, cwd) => setMeta(id, { cwd }),
  onStarted: (id, shell, cwd, shellId, fellBackFrom) => {
    setMeta(id, { shell, shellId, cwd, exited: false });
    // Make sure keystrokes reach a freshly started shell in the active pane.
    if (id === getActivePaneId()) focusActivePane();
    if (fellBackFrom) {
      const custom = appStore.get().settings.customShells.find((c) => c.id === fellBackFrom)?.name;
      showToast(`“${shellById(fellBackFrom)?.name ?? custom ?? fellBackFrom}” is not available. Started ${shell} instead.`);
    }
  },
  onSize: (id, cols, rows) => setMeta(id, { cols, rows }),
  onFocus: (id) => focusPane(id, false),
  onExit: (id, exitCode, signal) => {
    if (exitCode === 0 && !signal) {
      removePaneNow(id);
    } else {
      setMeta(id, { exited: true });
      registry.get(id)?.notifyExitedWithError(exitCode, signal);
    }
  }
};

function makePane(opts: SessionOptions): string {
  const id = uuid();
  paneMetaStore.set((m) => ({ ...m, [id]: { ...emptyMeta } }));
  registry.create(id, opts, callbacks);
  return id;
}

// ---- selectors -----------------------------------------------------------------------------

export function getActiveTab(): Tab | undefined {
  const { tabs, activeTabId } = workspaceStore.get();
  return tabs.find((t) => t.id === activeTabId);
}

export function getActivePaneId(): string | null {
  return getActiveTab()?.activePane ?? null;
}

/** Returns keyboard focus to the active terminal (e.g. after clicking tab chrome). */
export function focusActivePane(): void {
  const ui = uiStore.get();
  if (ui.palette || ui.settings.open || ui.confirm || ui.renamingTab || ui.menu) return;
  requestAnimationFrame(() => registry.get(getActivePaneId())?.focus());
}

export function tabTitle(tab: Tab, meta: Record<string, PaneMeta>): string {
  if (tab.customTitle) return tab.customTitle;
  const m = meta[tab.activePane];
  return m?.title || m?.shell || 'Terminal';
}

function updateTab(tabId: string, fn: (t: Tab) => Tab): void {
  workspaceStore.set((ws) => ({ ...ws, tabs: ws.tabs.map((t) => (t.id === tabId ? fn(t) : t)) }));
}

function tabOfPane(paneId: string): Tab | undefined {
  return workspaceStore.get().tabs.find((t) => hasLeaf(t.root, paneId));
}

// ---- tabs ----------------------------------------------------------------------------------

export function newTab(opts: { shellId?: string; inheritCwd?: boolean } = {}): string {
  const source = opts.inheritCwd === false ? undefined : (getActivePaneId() ?? undefined);
  const paneId = makePane({ shellId: opts.shellId, cwdFrom: source });
  const tab: Tab = { id: uuid(), customTitle: null, root: { kind: 'leaf', id: paneId }, activePane: paneId };
  workspaceStore.set((ws) => {
    const at = ws.tabs.findIndex((t) => t.id === ws.activeTabId);
    const tabs = [...ws.tabs];
    tabs.splice(at < 0 ? tabs.length : at + 1, 0, tab);
    return { tabs, activeTabId: tab.id };
  });
  return tab.id;
}

export function selectTab(tabId: string): void {
  if (workspaceStore.get().activeTabId === tabId) return;
  if (!workspaceStore.get().tabs.some((t) => t.id === tabId)) return;
  workspaceStore.set((ws) => ({ ...ws, activeTabId: tabId }));
}

export function selectTabByIndex(index: number): void {
  const { tabs } = workspaceStore.get();
  const tab = index === 8 ? tabs[tabs.length - 1] : tabs[index]; // like browsers, 9 jumps to the last tab
  if (tab) selectTab(tab.id);
}

export function cycleTab(delta: 1 | -1): void {
  const { tabs, activeTabId } = workspaceStore.get();
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === activeTabId);
  selectTab(tabs[(i + delta + tabs.length) % tabs.length]!.id);
}

export function moveTab(from: number, to: number): void {
  workspaceStore.set((ws) => {
    if (from === to || from < 0 || to < 0 || from >= ws.tabs.length || to >= ws.tabs.length) return ws;
    const tabs = [...ws.tabs];
    const [moved] = tabs.splice(from, 1);
    tabs.splice(to, 0, moved!);
    return { ...ws, tabs };
  });
}

export function renameTab(tabId: string, name: string | null): void {
  const clean = name?.trim().slice(0, 80) || null;
  updateTab(tabId, (t) => (t.customTitle === clean ? t : { ...t, customTitle: clean }));
}

export function duplicateTab(tabId: string): void {
  const tab = workspaceStore.get().tabs.find((t) => t.id === tabId);
  if (!tab) return;
  const idMap = new Map<string, string>();
  const root = mapLeaves(
    tab.root,
    (oldId) => {
      const newId = makePane({ cwdFrom: oldId });
      idMap.set(oldId, newId);
      return newId;
    },
    uuid
  );
  const copy: Tab = { id: uuid(), customTitle: tab.customTitle, root, activePane: idMap.get(tab.activePane) ?? leaves(root)[0]! };
  workspaceStore.set((ws) => {
    const at = ws.tabs.findIndex((t) => t.id === tabId);
    const tabs = [...ws.tabs];
    tabs.splice(at + 1, 0, copy);
    return { tabs, activeTabId: copy.id };
  });
}

function removeTabNow(tabId: string): void {
  const ws = workspaceStore.get();
  const index = ws.tabs.findIndex((t) => t.id === tabId);
  const tab = ws.tabs[index];
  if (!tab) return;
  for (const id of leaves(tab.root)) {
    registry.dispose(id);
    dropMeta(id);
  }
  const tabs = ws.tabs.filter((t) => t.id !== tabId);
  let activeTabId = ws.activeTabId;
  if (activeTabId === tabId) activeTabId = (tabs[index] ?? tabs[index - 1])?.id ?? null;
  workspaceStore.set({ tabs, activeTabId });
  const ui = uiStore.get();
  if (ui.find && !registry.get(ui.find)) uiStore.set((u) => ({ ...u, find: null }));
  if (tabs.length === 0) api().window.confirmClose();
}

export async function closeTab(tabId: string, opts: { confirm?: boolean } = {}): Promise<void> {
  const tab = workspaceStore.get().tabs.find((t) => t.id === tabId);
  if (!tab) return;
  if (opts.confirm !== false && !(await confirmClosing(leaves(tab.root), 'tab'))) return;
  removeTabNow(tabId);
}

export async function closeOtherTabs(tabId: string): Promise<void> {
  const others = workspaceStore.get().tabs.filter((t) => t.id !== tabId);
  if (others.length === 0) return;
  if (!(await confirmClosing(others.flatMap((t) => leaves(t.root)), 'tab'))) return;
  for (const t of others) removeTabNow(t.id);
  selectTab(tabId);
}

export async function closeTabsToRight(tabId: string): Promise<void> {
  const { tabs } = workspaceStore.get();
  const i = tabs.findIndex((t) => t.id === tabId);
  const right = tabs.slice(i + 1);
  if (i < 0 || right.length === 0) return;
  if (!(await confirmClosing(right.flatMap((t) => leaves(t.root)), 'tab'))) return;
  for (const t of right) removeTabNow(t.id);
}

// ---- panes ---------------------------------------------------------------------------------

export function splitPane(dir: SplitDir, paneId?: string, shellId?: string): void {
  const tab = paneId ? tabOfPane(paneId) : getActiveTab();
  const target = paneId ?? tab?.activePane;
  if (!tab || !target) return;
  const newId = makePane({ cwdFrom: target, shellId });
  updateTab(tab.id, (t) => ({ ...t, root: splitLeaf(t.root, target, dir, newId, uuid()), activePane: newId }));
}

export function focusPane(paneId: string, focusTerminal = true): void {
  const tab = tabOfPane(paneId);
  if (!tab) return;
  if (tab.activePane !== paneId || workspaceStore.get().activeTabId !== tab.id) {
    workspaceStore.set((ws) => ({ activeTabId: tab.id, tabs: ws.tabs.map((t) => (t.id === tab.id ? { ...t, activePane: paneId } : t)) }));
  }
  if (focusTerminal) registry.get(paneId)?.focus();
}

export function focusDirection(direction: Direction): void {
  const tab = getActiveTab();
  if (!tab) return;
  const next = findNeighbor(tab.root, tab.activePane, direction);
  if (next) focusPane(next);
}

export function cycleFocus(delta: 1 | -1): void {
  const tab = getActiveTab();
  if (!tab) return;
  focusPane(cycleLeaf(tab.root, tab.activePane, delta));
}

export function resizeSplit(tabId: string, splitId: string, ratio: number): void {
  updateTab(tabId, (t) => {
    const root = setRatio(t.root, splitId, ratio);
    return root === t.root ? t : { ...t, root };
  });
}

function removePaneNow(paneId: string): void {
  const tab = tabOfPane(paneId);
  if (!tab) {
    registry.dispose(paneId);
    dropMeta(paneId);
    return;
  }
  const root = removeLeaf(tab.root, paneId);
  if (!root) {
    removeTabNow(tab.id);
    return;
  }
  const order = leaves(tab.root);
  const i = order.indexOf(paneId);
  const fallback = order[i - 1] ?? order[i + 1] ?? leaves(root)[0]!;
  registry.dispose(paneId);
  dropMeta(paneId);
  updateTab(tab.id, (t) => ({ ...t, root, activePane: t.activePane === paneId ? fallback : t.activePane }));
  if (uiStore.get().find === paneId) uiStore.set((u) => ({ ...u, find: null }));
}

export async function closePane(paneId?: string, opts: { confirm?: boolean } = {}): Promise<void> {
  const id = paneId ?? getActivePaneId();
  if (!id) return;
  const tab = tabOfPane(id);
  if (!tab) return;
  if (leaves(tab.root).length === 1) return closeTab(tab.id, opts);
  if (opts.confirm !== false && !(await confirmClosing([id], 'pane'))) return;
  removePaneNow(id);
}

/**
 * Replaces the shell of a pane. Asks first only when that would terminate a running program; an idle shell is
 * swapped silently. The working directory is preserved by the main process.
 */
export async function switchPaneShell(paneId: string | undefined, shellId: string): Promise<boolean> {
  const id = paneId ?? getActivePaneId();
  const session = registry.get(id);
  if (!id || !session) return false;
  const meta = paneMetaStore.get()[id];
  if (meta?.shellId === shellId && !meta.exited) return false;
  const info = await session.info().catch(() => null);
  if (info?.busy) {
    const target = shellById(shellId)?.name ?? 'the new shell';
    const ok = await askConfirm({
      title: 'Switch shell?',
      message: `"${info.process ?? 'A program'}" is still running in this pane. Switching to ${target} will terminate it.`,
      confirmLabel: 'Switch',
      danger: true
    });
    if (!ok) return false;
  }
  const done = await session.switchShell(shellId);
  focusActivePane();
  return done;
}

export function restartPane(paneId?: string): void {
  const id = paneId ?? getActivePaneId();
  if (id) {
    setMeta(id, { exited: false });
    registry.get(id)?.restart();
  }
}

// ---- closing with confirmation -------------------------------------------------------------

async function runningProcesses(paneIds: string[]): Promise<string[]> {
  const infos = await Promise.all(paneIds.map((id) => registry.get(id)?.info().catch(() => null)));
  return infos.flatMap((i) => (i?.busy ? [i.process ?? 'a process'] : []));
}

async function confirmClosing(paneIds: string[], what: 'tab' | 'pane'): Promise<boolean> {
  const mode = appStore.get().settings.confirmClose;
  if (mode === 'never') return true;
  const busy = await runningProcesses(paneIds);
  if (mode === 'running' && busy.length === 0) return true;
  const plural = paneIds.length > 1;
  const message = busy.length
    ? busy.length === 1
      ? `"${busy[0]}" is still running. Closing this ${what} will terminate it.`
      : `${busy.length} terminals have running processes (${[...new Set(busy)].slice(0, 3).join(', ')}). They will be terminated.`
    : plural
      ? `Close ${paneIds.length} terminal sessions? Their shells will end.`
      : `Close this ${what}? Its shell session will end.`;
  return askConfirm({ title: plural ? 'Close terminals?' : `Close ${what}?`, message, confirmLabel: 'Close', danger: true });
}

/** Asks (when needed) and then closes the window, ending every shell. */
export async function requestQuit(): Promise<void> {
  const mode = appStore.get().settings.confirmClose;
  const ids = registry.ids();
  if (mode !== 'never' && ids.length > 0) {
    const busy = await runningProcesses(ids);
    if (mode === 'always' || busy.length > 0) {
      const message = busy.length
        ? `${busy.length === 1 ? `"${busy[0]}" is` : `${busy.length} terminals have running processes and are`} still running. Quitting will terminate ${busy.length === 1 ? 'it' : 'them'}.`
        : `${ids.length} terminal session${ids.length > 1 ? 's' : ''} will end.`;
      const ok = await askConfirm({ title: 'Quit TermGlass?', message, confirmLabel: 'Quit', danger: true });
      if (!ok) return;
    }
  }
  api().window.confirmClose();
}
