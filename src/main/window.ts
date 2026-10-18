import { app, BrowserWindow, screen } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '../shared/ipc';
import type { AppInfo, Settings, Theme, WindowState } from '../shared/types';

export interface Capabilities {
  translucent: boolean;
  roundedWindow: boolean;
  windowBlurSupported: boolean;
}

export function detectCapabilities(translucentSetting: boolean): Capabilities {
  if (process.platform === 'linux') {
    return { translucent: translucentSetting, roundedWindow: translucentSetting, windowBlurSupported: false };
  }
  if (process.platform === 'win32') {
    const build = Number(process.getSystemVersion().split('.')[2] ?? 0);
    const ok = build >= 22621; // acrylic backgroundMaterial needs Windows 11 22H2+
    return { translucent: ok, roundedWindow: false, windowBlurSupported: ok };
  }
  return { translucent: true, roundedWindow: false, windowBlurSupported: true };
}

interface SavedBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

function boundsFile(): string {
  return join(app.getPath('userData'), 'window.json');
}

function loadBounds(): SavedBounds {
  const fallback: SavedBounds = { width: 1120, height: 720, maximized: false };
  try {
    const b = JSON.parse(readFileSync(boundsFile(), 'utf8')) as Partial<SavedBounds>;
    const width = Math.min(8000, Math.max(480, Math.round(Number(b.width))));
    const height = Math.min(6000, Math.max(320, Math.round(Number(b.height))));
    if (!Number.isFinite(width) || !Number.isFinite(height)) return fallback;
    const out: SavedBounds = { width, height, maximized: b.maximized === true };
    if (Number.isFinite(b.x) && Number.isFinite(b.y)) {
      const x = Math.round(b.x!);
      const y = Math.round(b.y!);
      // Only restore a position that is still on a connected display.
      const visible = screen.getAllDisplays().some((d) => x >= d.bounds.x - 40 && x < d.bounds.x + d.bounds.width - 80 && y >= d.bounds.y - 10 && y < d.bounds.y + d.bounds.height - 80);
      if (visible) {
        out.x = x;
        out.y = y;
      }
    }
    return out;
  } catch {
    return fallback;
  }
}

export interface MainWindowDeps {
  settings: Settings;
  theme: Theme | undefined;
  caps: Capabilities;
  devUrl: string | null;
  /** Called when the window asks to close; return true to let it close right away. */
  shouldCloseImmediately: () => boolean;
}

export interface MainWindowHandle {
  win: BrowserWindow;
  allowClose(): void;
  applySettings(settings: Settings, theme: Theme | undefined): void;
  isTrustedUrl(url: string): boolean;
}

export function createMainWindow(deps: MainWindowDeps): MainWindowHandle {
  const { settings, caps, devUrl } = deps;
  const saved = loadBounds();
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';
  const bg = deps.theme?.ui.background ?? '#0b0b0d';

  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 480,
    minHeight: 320,
    show: false,
    title: 'TermGlass',
    autoHideMenuBar: true,
    frame: isMac || isWin ? true : false,
    titleBarStyle: isMac || isWin ? (isMac ? 'hiddenInset' : 'hidden') : undefined,
    titleBarOverlay: isWin ? { color: '#00000000', symbolColor: deps.theme?.ui.foreground ?? '#e8e8ea', height: 40 } : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 13 } : undefined,
    transparent: !isWin && caps.translucent,
    backgroundColor: caps.translucent ? '#00000000' : bg,
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      webviewTag: false,
      devTools: true
    }
  });

  const appOrigin = devUrl ? new URL(devUrl).origin : 'file://';
  const isTrustedUrl = (url: string) => {
    if (devUrl) return url.startsWith(appOrigin);
    return url.startsWith('file://') && url.includes('/dist/renderer/');
  };

  // Lock the renderer down: no popups, no navigation away from the app, no web permissions.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault();
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  const ses = win.webContents.session;
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);

  const sendState = () => {
    if (win.isDestroyed()) return;
    const state: WindowState = { maximized: win.isMaximized(), fullscreen: win.isFullScreen(), focused: win.isFocused() };
    win.webContents.send(IPC.winState, state);
  };
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);
  win.on('enter-full-screen', sendState);
  win.on('leave-full-screen', sendState);
  win.on('focus', sendState);
  win.on('blur', sendState);

  let saveTimer: NodeJS.Timeout | null = null;
  const saveBounds = () => {
    if (win.isDestroyed()) return;
    const normal = win.getNormalBounds();
    const data: SavedBounds = { width: normal.width, height: normal.height, x: normal.x, y: normal.y, maximized: win.isMaximized() };
    try {
      mkdirSync(app.getPath('userData'), { recursive: true });
      writeFileSync(boundsFile(), JSON.stringify(data), 'utf8');
    } catch {
      /* non-fatal */
    }
  };
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveBounds, 400);
  };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('close', saveBounds);

  let forceClose = false;
  win.on('close', (e) => {
    if (forceClose || win.webContents.isCrashed() || win.webContents.isLoading() || deps.shouldCloseImmediately()) return;
    e.preventDefault();
    win.webContents.send(IPC.winCloseRequested);
  });

  win.once('ready-to-show', () => {
    if (saved.maximized) win.maximize();
    win.show();
    sendState();
  });

  const handle: MainWindowHandle = {
    win,
    allowClose() {
      forceClose = true;
    },
    applySettings(s, theme) {
      applyMaterial(win, s, caps);
      if (isWin && theme) {
        try {
          win.setTitleBarOverlay({ color: '#00000000', symbolColor: theme.ui.foreground, height: 40 });
        } catch {
          /* older Electron/OS */
        }
      }
    },
    isTrustedUrl
  };
  applyMaterial(win, settings, caps);

  const hash = process.env.TERMGLASS_E2E ? 'e2e' : '';
  if (devUrl) void win.loadURL(hash ? `${devUrl}#${hash}` : devUrl);
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash });

  return handle;
}

function applyMaterial(win: BrowserWindow, s: Settings, caps: Capabilities): void {
  try {
    if (process.platform === 'win32' && caps.windowBlurSupported) win.setBackgroundMaterial(s.windowBlur ? 'acrylic' : 'none');
    if (process.platform === 'darwin') win.setVibrancy(s.windowBlur ? 'under-window' : null);
  } catch {
    /* unsupported platform build */
  }
}

export function buildAppInfo(caps: Capabilities, themesDir: string, devMode: boolean, nerdFonts: string[]): AppInfo {
  return {
    platform: process.platform as AppInfo['platform'],
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    homedir: app.getPath('home'),
    userDataDir: app.getPath('userData'),
    themesDir,
    translucent: caps.translucent,
    roundedWindow: caps.roundedWindow,
    windowBlurSupported: caps.windowBlurSupported,
    devMode,
    nerdFonts
  };
}
