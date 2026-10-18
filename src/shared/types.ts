export type Platform = 'linux' | 'win32' | 'darwin';
export type CursorShape = 'block' | 'underline' | 'bar';
export type MotionPref = 'full' | 'reduced' | 'off';
export type ConfirmClose = 'running' | 'always' | 'never';

export interface Settings {
  themeId: string;
  /** Accent override; null uses the theme's own accent. */
  accent: string | null;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorShape: CursorShape;
  cursorBlink: boolean;
  scrollback: number;
  copyOnSelect: boolean;
  gpuRendering: boolean;
  /** Shell used for new sessions: 'auto' (the system default) or the id of a detected or custom shell. */
  shellId: string;
  loginShell: boolean;
  /** User-defined shell executables, validated by the main process before they can be launched. */
  customShells: CustomShell[];
  /** Extra startup arguments per shell id, as typed by the user (parsed without any shell involved). */
  shellArgs: Record<string, string>;
  /** Empty string means the user's home directory. */
  cwd: string;
  confirmClose: ConfirmClose;
  windowOpacity: number;
  windowBlur: boolean;
  glassBlur: number;
  /** Linux only: create the window with a transparent surface (needs a restart to change). */
  translucentWindow: boolean;
  animations: MotionPref;
  showStatusBar: boolean;
  sidebarOpen: boolean;
  /** Overrides keyed by command id; '' disables a shortcut. */
  keybindings: Record<string, string>;
}

export interface TerminalColors {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface UiColors {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  border: string;
  accent: string;
}

export interface Theme {
  id: string;
  name: string;
  type: 'dark' | 'light';
  ui: UiColors;
  terminal: TerminalColors;
  /** Passed to xterm's minimumContrastRatio so that no text becomes unreadable. */
  minimumContrastRatio: number;
  builtin: boolean;
}

export interface ThemeLoadError {
  file: string;
  message: string;
}

export interface ThemeListResult {
  themes: Theme[];
  errors: ThemeLoadError[];
  dir: string;
}

export interface CustomShell {
  /** Always "custom-" followed by lowercase letters and digits. */
  id: string;
  name: string;
  path: string;
}

export type ShellKind = 'detected' | 'custom' | 'wsl';

export interface ShellInfo {
  id: string;
  name: string;
  path: string;
  kind: ShellKind;
  /** Fixed arguments the shell is always started with (for example `-d Ubuntu` for a WSL distribution). */
  args: string[];
  /** Extra context for the UI, such as the WSL distribution name. */
  detail?: string;
  /** This is the system default shell (the user's login shell on Unix). */
  isDefault: boolean;
}

export interface ShellProblem {
  /** Shell id the problem belongs to. */
  id: string;
  message: string;
}

export interface ShellListResult {
  shells: ShellInfo[];
  /** Id of the system default shell, or null when nothing could be detected. */
  systemDefaultId: string | null;
  /** Custom shells or argument strings that were rejected, with the reason. */
  problems: ShellProblem[];
}

export interface AppInfo {
  platform: Platform;
  version: string;
  electron: string;
  chrome: string;
  homedir: string;
  userDataDir: string;
  themesDir: string;
  /** The window surface can be translucent right now. */
  translucent: boolean;
  /** Linux frameless transparent window: the UI draws its own rounded corners. */
  roundedWindow: boolean;
  /** The OS can blur behind the window (macOS vibrancy, Windows acrylic). */
  windowBlurSupported: boolean;
  devMode: boolean;
  /** Installed Nerd Font families, used as fallbacks so prompt icons (Starship, Powerlevel10k) render. */
  nerdFonts: string[];
}

export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
}

export interface PtyCreateRequest {
  /** Renderer-generated UUID, also used to route output events. */
  id: string;
  cols: number;
  rows: number;
  shellId?: string;
  /** Start in the current directory of another PTY (resolved by the main process). */
  cwdFrom?: string;
}

export interface PtyRespawnRequest {
  id: string;
  cols: number;
  rows: number;
  shellId: string;
}

export type PtyCreateResult =
  | {
      ok: true;
      pid: number;
      shell: string;
      shellId: string;
      cwd: string;
      /** The requested shell was not available; this is the id that was requested. */
      fellBackFrom?: string;
    }
  | { ok: false; error: string };

export interface PtyInfo {
  alive: boolean;
  /** A foreground process other than the shell itself is running. */
  busy: boolean;
  process: string | null;
  cwd: string | null;
}

export type Unsubscribe = () => void;

export interface TermGlassApi {
  app: {
    getInfo(): Promise<AppInfo>;
    openExternal(url: string): Promise<void>;
    pickDirectory(): Promise<string | null>;
    /** Another launch of TermGlass (for example a desktop shortcut) asked for a new tab in this window. */
    onNewTabRequested(cb: () => void): Unsubscribe;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
    reset(): Promise<Settings>;
    onChanged(cb: (settings: Settings) => void): Unsubscribe;
  };
  themes: {
    list(): Promise<ThemeListResult>;
    reveal(): Promise<void>;
    onChanged(cb: (result: ThemeListResult) => void): Unsubscribe;
  };
  shells: {
    list(): Promise<ShellListResult>;
    /** Rescans the system for installed shells. */
    refresh(): Promise<ShellListResult>;
    /** Opens a native file picker for choosing a custom shell executable. */
    pickExecutable(): Promise<string | null>;
    onChanged(cb: (result: ShellListResult) => void): Unsubscribe;
  };
  pty: {
    create(req: PtyCreateRequest): Promise<PtyCreateResult>;
    /** Replaces the shell behind an existing PTY id, keeping the working directory. The old shell is only killed once the new one has started. */
    respawn(req: PtyRespawnRequest): Promise<PtyCreateResult>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    kill(id: string): void;
    ack(id: string, count: number): void;
    info(id: string): Promise<PtyInfo>;
    onData(cb: (id: string, data: string) => void): Unsubscribe;
    onExit(cb: (id: string, exitCode: number, signal: number | null) => void): Unsubscribe;
  };
  clipboard: {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
  };
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    toggleFullscreen(): void;
    toggleDevTools(): void;
    getState(): Promise<WindowState>;
    onState(cb: (state: WindowState) => void): Unsubscribe;
    onCloseRequested(cb: () => void): Unsubscribe;
    confirmClose(): void;
    setTitleBarTheme(colors: { background: string; symbol: string }): void;
  };
}
