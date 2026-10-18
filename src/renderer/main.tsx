import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-400-italic.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/jetbrains-mono/latin-700-italic.css';
import '@xterm/xterm/css/xterm.css';
import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BUILTIN_THEMES } from '@shared/themes';
import { App } from './App';
import { api } from './api';
import { applyAppearance, currentTerminalConfig, initAppearance } from './hooks/appearance';
import { appStore } from './state/app';
import { receiveSettings } from './state/settings';
import { receiveShells } from './state/shells';
import { newTab, requestQuit } from './state/workspace';
import { registry } from './terminal/registry';

async function boot(): Promise<void> {
  const root = document.getElementById('root')!;
  if (!window.termglass) {
    root.textContent = 'TermGlass must be run inside Electron: the preload bridge is missing.';
    return;
  }
  const bridge = api();
  const [info, settings, themes, shellList, win] = await Promise.all([
    bridge.app.getInfo(),
    bridge.settings.get(),
    bridge.themes.list(),
    bridge.shells.list(),
    bridge.window.getState()
  ]);
  appStore.set({ info, settings, customThemes: themes.themes, themeErrors: themes.errors, shellList, window: win });
  document.title = 'TermGlass';

  // Theme variables must be in place before the first paint, and the bundled font loaded before xterm measures it.
  applyAppearance();
  await Promise.race([
    Promise.all([document.fonts.load(`${settings.fontSize}px "JetBrains Mono"`), document.fonts.load(`bold ${settings.fontSize}px "JetBrains Mono"`)]),
    new Promise((r) => setTimeout(r, 1500))
  ]);

  registry.init(bridge, currentTerminalConfig());
  initAppearance();

  bridge.app.onNewTabRequested(() => newTab());
  bridge.settings.onChanged(receiveSettings);
  bridge.shells.onChanged(receiveShells);
  bridge.themes.onChanged((r) => appStore.set((s) => ({ ...s, customThemes: r.themes, themeErrors: r.errors })));
  bridge.window.onState((w) => appStore.set((s) => ({ ...s, window: w })));
  bridge.window.onCloseRequested(() => void requestQuit());

  // Fall back to the default theme if a previously selected custom theme was deleted.
  const known = new Set([...BUILTIN_THEMES, ...themes.themes].map((t) => t.id));
  if (!known.has(settings.themeId)) appStore.set((s) => ({ ...s, settings: { ...s.settings, themeId: BUILTIN_THEMES[0]!.id } }));

  newTab({ inheritCwd: false });
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  // Test hook for the end-to-end smoke test (read-only handles; no extra privileges are exposed).
  if (location.hash === '#e2e') {
    (window as unknown as { __termglass?: unknown }).__termglass = { registry };
  }
}

void boot().catch((err) => {
  console.error(err);
  document.getElementById('root')!.textContent = `TermGlass failed to start: ${err instanceof Error ? err.message : String(err)}`;
});
