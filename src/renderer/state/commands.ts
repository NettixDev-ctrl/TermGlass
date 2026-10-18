import { COMMANDS, effectiveKeys, formatKeys } from '@shared/keybindings';
import { defaultSettings } from '@shared/settings';
import { api } from '../api';
import { registry } from '../terminal/registry';
import { ACCENT_PRESETS } from './accents';
import { allThemes, appStore, askConfirm, openSettings, showShellPicker, showToast, togglePalette, uiStore, type SettingsSection } from './app';
import { updateSettings, resetSettings } from './settings';
import { refreshShells, setDefaultShell } from './shells';
import {
  closeOtherTabs,
  closePane,
  closeTab,
  closeTabsToRight,
  cycleFocus,
  cycleTab,
  duplicateTab,
  focusDirection,
  getActivePaneId,
  getActiveTab,
  newTab,
  requestQuit,
  restartPane,
  selectTab,
  splitPane,
  switchPaneShell,
  tabTitle,
  paneMetaStore,
  workspaceStore
} from './workspace';

const activeSession = () => registry.get(getActivePaneId());

/** Executes a command by id. Shared by keyboard shortcuts, the command palette and context menus. */
export function runCommand(id: string): void {
  const settings = appStore.get().settings;
  const tab = getActiveTab();
  switch (id) {
    case 'palette.open':
      return togglePalette();
    case 'settings.open':
      return openSettings();
    case 'tab.new':
      newTab();
      return;
    case 'tab.close':
      if (tab) void closeTab(tab.id);
      return;
    case 'tab.next':
      return cycleTab(1);
    case 'tab.prev':
      return cycleTab(-1);
    case 'tab.rename':
      if (tab) uiStore.set((u) => ({ ...u, renamingTab: tab.id }));
      return;
    case 'tab.duplicate':
      if (tab) duplicateTab(tab.id);
      return;
    case 'tab.closeOthers':
      if (tab) void closeOtherTabs(tab.id);
      return;
    case 'tab.closeRight':
      if (tab) void closeTabsToRight(tab.id);
      return;
    case 'pane.splitRight':
      return splitPane('row');
    case 'pane.splitDown':
      return splitPane('col');
    case 'pane.close':
      void closePane();
      return;
    case 'pane.focusLeft':
      return focusDirection('left');
    case 'pane.focusRight':
      return focusDirection('right');
    case 'pane.focusUp':
      return focusDirection('up');
    case 'pane.focusDown':
      return focusDirection('down');
    case 'pane.focusNext':
      return cycleFocus(1);
    case 'pane.focusPrev':
      return cycleFocus(-1);
    case 'shell.selector':
      return showShellPicker('switch');
    case 'shell.newTabWith':
      return showShellPicker('new-tab', undefined, 'below');
    case 'shell.refresh':
      void refreshShells().then((r) => showToast(`Found ${r.shells.length} shell${r.shells.length === 1 ? '' : 's'}`));
      return;
    case 'pane.restart':
      return restartPane();
    case 'term.copy': {
      const s = activeSession();
      if (s) void s.copy().then(() => s.focus());
      return;
    }
    case 'term.paste':
      void activeSession()?.paste();
      return;
    case 'term.selectAll':
      return activeSession()?.selectAll();
    case 'term.clear':
      return activeSession()?.clear();
    case 'term.find': {
      const pane = getActivePaneId();
      if (pane) uiStore.set((u) => ({ ...u, find: pane }));
      return;
    }
    case 'term.zoomIn':
      return updateSettings({ fontSize: settings.fontSize + 1 });
    case 'term.zoomOut':
      return updateSettings({ fontSize: settings.fontSize - 1 });
    case 'term.zoomReset':
      return updateSettings({ fontSize: defaultSettings('linux').fontSize });
    case 'sidebar.toggle':
      return updateSettings({ sidebarOpen: !settings.sidebarOpen });
    case 'statusbar.toggle':
      return updateSettings({ showStatusBar: !settings.showStatusBar });
    case 'window.fullscreen':
      return api().window.toggleFullscreen();
    case 'window.devtools':
      return api().window.toggleDevTools();
    case 'app.quit':
      void requestQuit();
      return;
  }
}

export interface PaletteEntry {
  id: string;
  title: string;
  category: string;
  keys?: string;
  run: () => void;
}

/** Builds the command palette list from the current state (tabs, themes, shells, settings). */
export function buildPaletteEntries(): PaletteEntry[] {
  const state = appStore.get();
  const { settings, info } = state;
  const entries: PaletteEntry[] = [];

  for (const def of COMMANDS) {
    const keys = formatKeys(effectiveKeys(def, settings.keybindings, info.platform), info.platform);
    entries.push({ id: def.id, title: def.title, category: def.category, keys: keys || undefined, run: () => runCommand(def.id) });
  }

  const meta = paneMetaStore.get();
  const ws = workspaceStore.get();
  ws.tabs.forEach((t, i) => {
    entries.push({
      id: `tab.switch.${t.id}`,
      title: `Switch to Tab ${i + 1}: ${tabTitle(t, meta)}`,
      category: 'Sessions',
      keys: i < 9 ? formatKeys(`${info.platform === 'darwin' ? 'Meta' : 'Alt'}+${i + 1}`, info.platform) : undefined,
      run: () => selectTab(t.id)
    });
  });

  for (const sh of state.shellList.shells) {
    entries.push({ id: `tab.newShell.${sh.id}`, title: `New Tab with ${sh.name}`, category: 'Shell', run: () => newTab({ shellId: sh.id }) });
    entries.push({ id: `pane.switchShell.${sh.id}`, title: `Switch Pane to ${sh.name}`, category: 'Shell', run: () => void switchPaneShell(undefined, sh.id) });
    entries.push({ id: `pane.splitRightShell.${sh.id}`, title: `Split Right with ${sh.name}`, category: 'Shell', run: () => splitPane('row', undefined, sh.id) });
    entries.push({ id: `pane.splitDownShell.${sh.id}`, title: `Split Down with ${sh.name}`, category: 'Shell', run: () => splitPane('col', undefined, sh.id) });
    entries.push({
      id: `shell.default.${sh.id}`,
      title: `Set Default Shell: ${sh.name}${settings.shellId === sh.id ? '  (current)' : ''}`,
      category: 'Shell',
      run: () => setDefaultShell(sh.id)
    });
  }
  entries.push({ id: 'shell.default.auto', title: `Set Default Shell: System Default${settings.shellId === 'auto' ? '  (current)' : ''}`, category: 'Shell', run: () => setDefaultShell('auto') });

  for (const theme of allThemes(state)) {
    entries.push({
      id: `theme.${theme.id}`,
      title: `Theme: ${theme.name}${theme.id === settings.themeId ? '  (current)' : ''}`,
      category: 'Themes',
      run: () => updateSettings({ themeId: theme.id })
    });
  }
  entries.push({ id: 'accent.default', title: 'Accent Color: Theme Default', category: 'Themes', run: () => updateSettings({ accent: null }) });
  for (const a of ACCENT_PRESETS) {
    entries.push({ id: `accent.${a.name}`, title: `Accent Color: ${a.name}`, category: 'Themes', run: () => updateSettings({ accent: a.value }) });
  }

  const sections: [SettingsSection, string][] = [
    ['appearance', 'Appearance'],
    ['terminal', 'Terminal'],
    ['shell', 'Shells'],
    ['keyboard', 'Keyboard Shortcuts'],
    ['themes', 'Custom Themes']
  ];
  for (const [section, label] of sections) {
    entries.push({ id: `settings.${section}`, title: `Settings: ${label}`, category: 'Settings', run: () => openSettings(section) });
  }
  entries.push({ id: 'themes.reveal', title: 'Open Custom Themes Folder', category: 'Settings', run: () => void api().themes.reveal() });
  entries.push({
    id: 'settings.reset',
    title: 'Reset All Settings',
    category: 'Settings',
    run: () => {
      void askConfirm({ title: 'Reset settings?', message: 'All preferences and custom shortcuts return to their defaults.', confirmLabel: 'Reset', danger: true }).then((ok) => ok && resetSettings());
    }
  });

  return entries;
}
