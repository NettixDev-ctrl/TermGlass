import { clipboard, dialog, ipcMain, shell, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { IPC, LIMITS } from '../shared/ipc';
import type { AppInfo, PtyCreateRequest, PtyCreateResult, PtyInfo, PtyRespawnRequest, Settings, ShellListResult, ThemeListResult, WindowState } from '../shared/types';
import { isPtyId, type PtyManager } from './pty-manager';
import type { SettingsStore } from './settings-store';
import type { ThemesStore } from './themes-store';
import type { ShellCatalog } from './shells';
import type { MainWindowHandle } from './window';

export interface IpcDeps {
  getWindow: () => MainWindowHandle | null;
  ptys: PtyManager;
  settings: SettingsStore;
  themes: ThemesStore;
  shells: ShellCatalog;
  appInfo: () => AppInfo;
  onSettingsChanged: (s: Settings) => void;
  onShellsChanged: (cb: (r: ShellListResult) => void) => () => void;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Registers every IPC handler. All handlers verify the sender is the app's own top-level frame and validate
 * their payloads; there is deliberately no channel that executes arbitrary commands.
 */
export function registerIpc(deps: IpcDeps): () => void {
  const trusted = (e: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null => {
    const handle = deps.getWindow();
    if (!handle || handle.win.isDestroyed()) return null;
    if (e.sender !== handle.win.webContents) return null;
    const frame = e.senderFrame;
    if (!frame || frame !== e.sender.mainFrame || !handle.isTrustedUrl(frame.url)) return null;
    return handle.win;
  };

  const on = (channel: string, fn: (win: BrowserWindow, ...args: unknown[]) => void) => {
    ipcMain.on(channel, (e, ...args) => {
      const win = trusted(e);
      if (win) fn(win, ...args);
    });
  };
  const handle = <T>(channel: string, fn: (win: BrowserWindow, ...args: unknown[]) => T | Promise<T>) => {
    ipcMain.handle(channel, (e, ...args) => {
      const win = trusted(e);
      if (!win) throw new Error('Untrusted IPC sender');
      return fn(win, ...args);
    });
  };

  handle(IPC.appInfo, () => deps.appInfo());
  handle(IPC.appOpenExternal, async (_w, url) => {
    if (typeof url !== 'string' || url.length > 2048) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return;
    await shell.openExternal(parsed.toString());
  });
  handle<string | null>(IPC.appPickDirectory, async (win) => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });

  handle<Settings>(IPC.settingsGet, () => deps.settings.get());
  handle<Settings>(IPC.settingsSet, (_w, patch) => deps.settings.set(patch));
  handle<Settings>(IPC.settingsReset, () => deps.settings.reset());

  handle<ThemeListResult>(IPC.themesList, () => deps.themes.list());
  handle<void>(IPC.themesReveal, async () => {
    await shell.openPath(deps.themes.dir);
  });
  handle<ShellListResult>(IPC.shellsList, () => deps.shells.list());
  handle<ShellListResult>(IPC.shellsRefresh, () => deps.shells.scan());
  handle<string | null>(IPC.shellsPickExecutable, async (win) => {
    const res = await dialog.showOpenDialog(win, { properties: ['openFile'], title: 'Choose a shell executable' });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });

  handle<PtyCreateResult>(IPC.ptyCreate, (_w, raw): PtyCreateResult => {
    const r = raw as Partial<PtyCreateRequest> | null;
    if (!r || typeof r !== 'object' || !isPtyId(r.id) || !isInt(r.cols) || !isInt(r.rows)) return { ok: false, error: 'Invalid request.' };
    if (r.shellId !== undefined && (typeof r.shellId !== 'string' || r.shellId.length > 64)) return { ok: false, error: 'Invalid shell.' };
    if (r.cwdFrom !== undefined && !isPtyId(r.cwdFrom)) return { ok: false, error: 'Invalid cwd source.' };
    return deps.ptys.create({ id: r.id, cols: r.cols, rows: r.rows, shellId: r.shellId, cwdFrom: r.cwdFrom });
  });
  handle<PtyCreateResult>(IPC.ptyRespawn, (_w, raw): PtyCreateResult => {
    const r = raw as Partial<PtyRespawnRequest> | null;
    if (!r || typeof r !== 'object' || !isPtyId(r.id) || !isInt(r.cols) || !isInt(r.rows) || typeof r.shellId !== 'string' || r.shellId.length > 64) return { ok: false, error: 'Invalid request.' };
    return deps.ptys.respawn({ id: r.id, cols: r.cols, rows: r.rows, shellId: r.shellId });
  });
  on(IPC.ptyWrite, (_w, id, data) => {
    if (isPtyId(id) && typeof data === 'string' && data.length <= LIMITS.maxWriteChars) deps.ptys.write(id, data);
  });
  on(IPC.ptyResize, (_w, id, cols, rows) => {
    if (isPtyId(id) && isInt(cols) && isInt(rows)) deps.ptys.resize(id, cols, rows);
  });
  on(IPC.ptyKill, (_w, id) => {
    if (isPtyId(id)) deps.ptys.kill(id);
  });
  on(IPC.ptyAck, (_w, id, count) => {
    if (isPtyId(id) && isInt(count) && count >= 0) deps.ptys.ack(id, count);
  });
  handle<PtyInfo>(IPC.ptyInfo, (_w, id) => (isPtyId(id) ? deps.ptys.info(id) : { alive: false, busy: false, process: null, cwd: null }));

  handle<string>(IPC.clipboardRead, async () => (await clipboard.readText()).slice(0, LIMITS.maxClipboardChars));
  handle<void>(IPC.clipboardWrite, async (_w, text) => {
    if (typeof text === 'string' && text.length <= LIMITS.maxClipboardChars) await clipboard.writeText(text);
  });

  on(IPC.winMinimize, (w) => w.minimize());
  on(IPC.winToggleMaximize, (w) => (w.isMaximized() ? w.unmaximize() : w.maximize()));
  on(IPC.winClose, (w) => w.close());
  on(IPC.winToggleFullscreen, (w) => w.setFullScreen(!w.isFullScreen()));
  on(IPC.winToggleDevTools, (w) => w.webContents.toggleDevTools());
  handle<WindowState>(IPC.winGetState, (w) => ({ maximized: w.isMaximized(), fullscreen: w.isFullScreen(), focused: w.isFocused() }));
  on(IPC.winConfirmClose, (w) => {
    deps.getWindow()?.allowClose();
    w.close();
  });
  on(IPC.winTitleBarTheme, (w, colors) => {
    if (process.platform !== 'win32' || typeof colors !== 'object' || colors === null) return;
    const symbol = (colors as { symbol?: unknown }).symbol;
    if (typeof symbol === 'string' && /^#[0-9a-f]{6}$/i.test(symbol)) {
      try {
        w.setTitleBarOverlay({ color: '#00000000', symbolColor: symbol, height: 40 });
      } catch {
        /* unsupported */
      }
    }
  });

  const offSettings = deps.settings.onChange((s) => {
    const w = deps.getWindow();
    if (w && !w.win.isDestroyed()) w.win.webContents.send(IPC.settingsChanged, s);
    deps.onSettingsChanged(s);
  });
  const offShells = deps.onShellsChanged((r) => {
    const w = deps.getWindow();
    if (w && !w.win.isDestroyed()) w.win.webContents.send(IPC.shellsChanged, r);
  });
  const offThemes = deps.themes.onChange((r) => {
    const w = deps.getWindow();
    if (w && !w.win.isDestroyed()) w.win.webContents.send(IPC.themesChanged, r);
  });

  return () => {
    offSettings();
    offThemes();
    offShells();
    for (const ch of Object.values(IPC)) {
      ipcMain.removeAllListeners(ch);
      ipcMain.removeHandler(ch);
    }
  };
}
