// IPC channel names. Every channel is an explicit, narrowly-scoped operation: there is no generic "run command" channel.
export const IPC = {
  appInfo: 'app:info',
  appOpenExternal: 'app:open-external',
  appPickDirectory: 'app:pick-directory',
  appNewTab: 'app:new-tab',

  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsReset: 'settings:reset',
  settingsChanged: 'settings:changed',

  themesList: 'themes:list',
  themesReveal: 'themes:reveal',
  themesChanged: 'themes:changed',

  shellsList: 'shells:list',
  shellsRefresh: 'shells:refresh',
  shellsPickExecutable: 'shells:pick-executable',
  shellsChanged: 'shells:changed',

  ptyCreate: 'pty:create',
  ptyRespawn: 'pty:respawn',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptyAck: 'pty:ack',
  ptyInfo: 'pty:info',
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',

  clipboardRead: 'clipboard:read',
  clipboardWrite: 'clipboard:write',

  winMinimize: 'win:minimize',
  winToggleMaximize: 'win:toggle-maximize',
  winClose: 'win:close',
  winToggleFullscreen: 'win:toggle-fullscreen',
  winToggleDevTools: 'win:toggle-devtools',
  winGetState: 'win:get-state',
  winState: 'win:state',
  winCloseRequested: 'win:close-requested',
  winConfirmClose: 'win:confirm-close',
  winTitleBarTheme: 'win:titlebar-theme'
} as const;

export const LIMITS = {
  maxWriteChars: 1 << 20,
  maxClipboardChars: 8 << 20,
  minCols: 2,
  maxCols: 1000,
  minRows: 1,
  maxRows: 500
} as const;
