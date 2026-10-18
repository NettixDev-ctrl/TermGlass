import { app, BrowserWindow, Menu } from 'electron';
import { IPC } from '../shared/ipc';
import { registerIpc } from './ipc';
import { PtyManager } from './pty-manager';
import { SettingsStore } from './settings-store';
import { ShellCatalog } from './shells';
import { ThemesStore } from './themes-store';
import { detectNerdFontFamilies } from './fonts';
import { buildAppInfo, createMainWindow, detectCapabilities, type MainWindowHandle } from './window';

app.setName('TermGlass');
if (process.platform === 'linux') {
  app.setDesktopName('termglass.desktop');
  // Prefer native Wayland when the session is Wayland, X11 otherwise.
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');
}
if (process.env.TERMGLASS_USER_DATA) app.setPath('userData', process.env.TERMGLASS_USER_DATA);

const devUrl = process.env.TERMGLASS_DEV_URL ?? null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let handle: MainWindowHandle | null = null;
  let quitting = false;

  app.on('second-instance', () => {
    const win = handle?.win;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    // Launching TermGlass again (e.g. from a Ctrl+Alt+T shortcut) behaves like opening a new terminal.
    win.webContents.send(IPC.appNewTab);
  });

  void app.whenReady().then(() => {
    const platform = process.platform as 'linux' | 'win32' | 'darwin';
    const userData = app.getPath('userData');
    const settings = new SettingsStore(userData, platform);
    const themes = new ThemesStore(userData);
    const shells = new ShellCatalog(() => settings.get());
    shells.scan();
    const nerdFonts = detectNerdFontFamilies();
    const shellListeners = new Set<(r: ReturnType<ShellCatalog['list']>) => void>();
    // Custom shells and startup arguments feed the catalog, so changing them rescans.
    let shellConfigSig = JSON.stringify([settings.get().customShells, settings.get().shellArgs]);

    // --opaque is an escape hatch for systems where a transparent window renders black (no compositor).
    const caps = detectCapabilities(settings.get().translucentWindow && !process.argv.includes('--opaque'));
    const send = (channel: string, ...args: unknown[]) => {
      if (handle && !handle.win.isDestroyed()) handle.win.webContents.send(channel, ...args);
    };
    const ptys = new PtyManager(
      {
        data: (id, data) => send(IPC.ptyData, id, data),
        exit: (id, code, signal) => send(IPC.ptyExit, id, code, signal)
      },
      shells,
      () => settings.get(),
      app.getVersion()
    );

    if (platform === 'darwin') {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { role: 'appMenu' },
          { role: 'windowMenu' }
        ])
      );
    } else {
      // The default menu would swallow terminal shortcuts such as Ctrl+W and Ctrl+R.
      Menu.setApplicationMenu(null);
    }

    const open = () => {
      handle = createMainWindow({
        settings: settings.get(),
        theme: themes.find(settings.get().themeId),
        caps,
        devUrl,
        shouldCloseImmediately: () => ptys.size === 0
      });
      handle.win.on('closed', () => {
        handle = null;
      });
    };

    registerIpc({
      getWindow: () => handle,
      ptys,
      settings,
      themes,
      shells,
      appInfo: () => buildAppInfo(caps, themes.dir, devUrl !== null, nerdFonts),
      onSettingsChanged: (s) => {
        handle?.applySettings(s, themes.find(s.themeId));
        const sig = JSON.stringify([s.customShells, s.shellArgs]);
        if (sig !== shellConfigSig) {
          shellConfigSig = sig;
          const result = shells.scan();
          for (const l of shellListeners) l(result);
        }
      },
      onShellsChanged: (cb) => {
        shellListeners.add(cb);
        return () => shellListeners.delete(cb);
      }
    });

    open();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) open();
    });
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
    app.on('before-quit', (e) => {
      if (quitting) return;
      quitting = true;
      e.preventDefault();
      settings.flush();
      themes.dispose();
      void ptys.killAll().finally(() => app.quit());
    });
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => app.quit());
  });
}
