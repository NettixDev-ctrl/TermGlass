import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC } from '../shared/ipc';
import type { TermGlassApi, Unsubscribe } from '../shared/types';

/** Subscribes to a main→renderer channel and returns an unsubscribe function. The raw IPC event is never exposed. */
function subscribe<A extends unknown[]>(channel: string, cb: (...args: A) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: TermGlassApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC.appInfo),
    openExternal: (url) => ipcRenderer.invoke(IPC.appOpenExternal, url),
    pickDirectory: () => ipcRenderer.invoke(IPC.appPickDirectory),
    onNewTabRequested: (cb) => subscribe(IPC.appNewTab, cb)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch),
    reset: () => ipcRenderer.invoke(IPC.settingsReset),
    onChanged: (cb) => subscribe(IPC.settingsChanged, cb)
  },
  themes: {
    list: () => ipcRenderer.invoke(IPC.themesList),
    reveal: () => ipcRenderer.invoke(IPC.themesReveal),
    onChanged: (cb) => subscribe(IPC.themesChanged, cb)
  },
  shells: {
    list: () => ipcRenderer.invoke(IPC.shellsList),
    refresh: () => ipcRenderer.invoke(IPC.shellsRefresh),
    pickExecutable: () => ipcRenderer.invoke(IPC.shellsPickExecutable),
    onChanged: (cb) => subscribe(IPC.shellsChanged, cb)
  },
  pty: {
    create: (req) => ipcRenderer.invoke(IPC.ptyCreate, req),
    respawn: (req) => ipcRenderer.invoke(IPC.ptyRespawn, req),
    write: (id, data) => ipcRenderer.send(IPC.ptyWrite, id, data),
    resize: (id, cols, rows) => ipcRenderer.send(IPC.ptyResize, id, cols, rows),
    kill: (id) => ipcRenderer.send(IPC.ptyKill, id),
    ack: (id, count) => ipcRenderer.send(IPC.ptyAck, id, count),
    info: (id) => ipcRenderer.invoke(IPC.ptyInfo, id),
    onData: (cb) => subscribe(IPC.ptyData, cb),
    onExit: (cb) => subscribe(IPC.ptyExit, cb)
  },
  clipboard: {
    readText: () => ipcRenderer.invoke(IPC.clipboardRead),
    writeText: (text) => ipcRenderer.invoke(IPC.clipboardWrite, text)
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.winMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.winToggleMaximize),
    close: () => ipcRenderer.send(IPC.winClose),
    toggleFullscreen: () => ipcRenderer.send(IPC.winToggleFullscreen),
    toggleDevTools: () => ipcRenderer.send(IPC.winToggleDevTools),
    getState: () => ipcRenderer.invoke(IPC.winGetState),
    onState: (cb) => subscribe(IPC.winState, cb),
    onCloseRequested: (cb) => subscribe(IPC.winCloseRequested, cb),
    confirmClose: () => ipcRenderer.send(IPC.winConfirmClose),
    setTitleBarTheme: (colors) => ipcRenderer.send(IPC.winTitleBarTheme, colors)
  }
};

contextBridge.exposeInMainWorld('termglass', api);
