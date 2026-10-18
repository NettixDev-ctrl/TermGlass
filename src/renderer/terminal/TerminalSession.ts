import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon, type ISearchOptions } from '@xterm/addon-search';
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import type { PtyInfo } from '@shared/types';
import { api } from '../api';
import type { TerminalConfig } from './config';

export interface SessionCallbacks {
  onTitle(id: string, title: string): void;
  onCwd(id: string, cwd: string): void;
  /** The shell exited on its own (not because the pane was closed or restarted). */
  onExit(id: string, exitCode: number, signal: number | null): void;
  onFocus(id: string): void;
  onStarted(id: string, shell: string, cwd: string, shellId: string, fellBackFrom?: string): void;
  onSize(id: string, cols: number, rows: number): void;
}

export interface SessionOptions {
  shellId?: string;
  cwdFrom?: string;
}

export interface SearchState {
  index: number;
  count: number;
}

const ACK_BATCH_DELAY_MS = 8;

/**
 * Owns one xterm.js instance and its PTY. Terminal output never touches React state: PTY data is
 * written straight into xterm, and React only hosts the session's DOM element.
 */
export class TerminalSession {
  readonly term: Terminal;
  /** Persistent container; PaneView re-parents it so the terminal survives layout changes. */
  readonly element: HTMLDivElement;

  private readonly fitAddon = new FitAddon();
  private readonly searchAddon = new SearchAddon({ highlightLimit: 1000 });
  private webgl: WebglAddon | null = null;
  private opened = false;
  private visible = false;
  private started = false;
  private ptyReady = false;
  private disposed = false;
  private restarting = false;
  private exited = false;
  private fitFrame = 0;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSent = { cols: 0, rows: 0 };
  private pendingAck = 0;
  private ackTimer: ReturnType<typeof setTimeout> | null = null;
  private selectionTimer: ReturnType<typeof setTimeout> | null = null;
  private bellTimer: ReturnType<typeof setTimeout> | null = null;
  private config: TerminalConfig;
  private searchListeners = new Set<(s: SearchState) => void>();
  private disposables: { dispose(): void }[] = [];

  constructor(
    readonly id: string,
    private readonly opts: SessionOptions,
    config: TerminalConfig,
    private readonly cb: SessionCallbacks
  ) {
    this.config = config;
    this.element = document.createElement('div');
    this.element.className = 'terminal-host';

    this.term = new Terminal({
      allowProposedApi: true,
      allowTransparency: true,
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      lineHeight: config.lineHeight,
      cursorStyle: config.cursorStyle,
      cursorBlink: config.cursorBlink,
      cursorInactiveStyle: 'outline',
      scrollback: config.scrollback,
      theme: config.theme,
      minimumContrastRatio: config.minimumContrastRatio,
      macOptionIsMeta: true,
      scrollOnUserInput: true,
      rightClickSelectsWord: false,
      customGlyphs: true,
      drawBoldTextInBrightColors: false,
      wordSeparator: ' ()[]{}\'":;,`<>|',
      smoothScrollDuration: 0
    });

    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(this.searchAddon);
    this.term.loadAddon(new UnicodeGraphemesAddon());
    this.term.unicode.activeVersion = '15-graphemes';
    this.term.loadAddon(
      new WebLinksAddon((event, uri) => {
        // Require Ctrl/Cmd+click so links are never opened by an accidental click while selecting text.
        if (event.ctrlKey || event.metaKey) void api().app.openExternal(uri);
      })
    );

    this.disposables.push(
      this.term.onData((data) => api().pty.write(this.id, data)),
      this.term.onTitleChange((title) => this.cb.onTitle(this.id, title)),
      this.term.onResize(({ cols, rows }) => {
        this.cb.onSize(this.id, cols, rows);
        this.queueResize();
      }),
      this.term.onBell(() => this.flashBell()),
      this.term.onSelectionChange(() => this.onSelectionChange()),
      this.searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
        for (const l of this.searchListeners) l({ index: resultIndex, count: resultCount });
      })
    );

    // OSC 7: shells that report their working directory as file://host/path.
    this.disposables.push(
      this.term.parser.registerOscHandler(7, (data) => {
        try {
          const url = new URL(data);
          if (url.protocol === 'file:') this.cb.onCwd(this.id, decodeURIComponent(url.pathname));
        } catch {
          /* ignore malformed reports */
        }
        return true;
      })
    );

    this.term.attachCustomKeyEventHandler((ev) => {
      if (ev.type === 'keydown' && this.exited && ev.key === 'Enter' && !ev.ctrlKey && !ev.altKey && !ev.metaKey && !ev.shiftKey) {
        this.restart();
        return false;
      }
      return true;
    });
  }

  // ---- DOM / layout -------------------------------------------------------------------------

  attach(host: HTMLElement): void {
    if (this.element.parentElement !== host) host.appendChild(this.element);
    if (!this.opened) {
      this.term.open(this.element);
      this.opened = true;
      this.term.textarea?.addEventListener('focus', () => this.cb.onFocus(this.id));
      if (this.visible) this.loadWebgl();
    }
    this.scheduleFit();
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    if (visible) {
      if (this.opened) this.loadWebgl();
      this.scheduleFit();
    } else {
      this.unloadWebgl();
    }
  }

  scheduleFit(): void {
    if (this.fitFrame || this.disposed) return;
    this.fitFrame = requestAnimationFrame(() => {
      this.fitFrame = 0;
      this.fit();
    });
  }

  private fit(): void {
    if (this.disposed || !this.opened || !this.visible) return;
    const el = this.element;
    if (!el.isConnected || el.clientWidth < 8 || el.clientHeight < 8) return;
    const dims = this.fitAddon.proposeDimensions();
    if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows) || dims.cols < 2 || dims.rows < 1) return;
    if (dims.cols !== this.term.cols || dims.rows !== this.term.rows) this.term.resize(dims.cols, dims.rows);
    // The PTY is created after the first successful fit so the shell starts with the right size.
    if (!this.started) void this.start();
  }

  focus(): void {
    if (this.opened) this.term.focus();
  }

  get cols(): number {
    return this.term.cols;
  }
  get rows(): number {
    return this.term.rows;
  }

  // ---- configuration ------------------------------------------------------------------------

  applyConfig(config: TerminalConfig): void {
    const prev = this.config;
    this.config = config;
    const o = this.term.options;
    o.fontFamily = config.fontFamily;
    o.fontSize = config.fontSize;
    o.lineHeight = config.lineHeight;
    o.cursorStyle = config.cursorStyle;
    o.cursorBlink = config.cursorBlink;
    o.scrollback = config.scrollback;
    o.theme = config.theme;
    o.minimumContrastRatio = config.minimumContrastRatio;
    if (prev.gpu !== config.gpu) {
      if (config.gpu && this.visible && this.opened) this.loadWebgl();
      else if (!config.gpu) this.unloadWebgl();
    }
    this.scheduleFit();
  }

  private loadWebgl(): void {
    if (this.webgl || !this.config.gpu || this.disposed) return;
    try {
      const addon = new WebglAddon();
      addon.onContextLoss(() => {
        addon.dispose();
        if (this.webgl === addon) this.webgl = null;
      });
      this.term.loadAddon(addon);
      this.webgl = addon;
    } catch {
      this.webgl = null; // xterm falls back to its DOM renderer
    }
  }

  private unloadWebgl(): void {
    this.webgl?.dispose();
    this.webgl = null;
  }

  // ---- PTY ----------------------------------------------------------------------------------

  private async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    this.exited = false;
    const res = await api().pty.create({ id: this.id, cols: this.term.cols, rows: this.term.rows, shellId: this.opts.shellId, cwdFrom: this.opts.cwdFrom });
    if (this.disposed) {
      if (res.ok) api().pty.kill(this.id);
      return;
    }
    if (!res.ok) {
      this.exited = true;
      this.notice(`Could not start the shell: ${res.error}`, true);
      return;
    }
    this.ptyReady = true;
    this.lastSent = { cols: this.term.cols, rows: this.term.rows };
    this.cb.onStarted(this.id, res.shell, res.cwd, res.shellId, res.fellBackFrom);
    // The pane may have been resized while the PTY was being created.
    this.queueResize();
  }

  /** Called by the registry for every chunk of PTY output. */
  write(data: string): void {
    if (this.disposed) return;
    const n = data.length;
    this.term.write(data, () => {
      this.pendingAck += n;
      if (!this.ackTimer) {
        this.ackTimer = setTimeout(() => {
          this.ackTimer = null;
          const count = this.pendingAck;
          this.pendingAck = 0;
          if (count > 0 && !this.disposed) api().pty.ack(this.id, count);
        }, ACK_BATCH_DELAY_MS);
      }
    });
  }

  handleExit(exitCode: number, signal: number | null): void {
    this.ptyReady = false;
    this.started = false;
    if (this.disposed) return;
    if (this.restarting) {
      this.restarting = false;
      this.term.write('\r\n');
      void this.start();
      return;
    }
    this.exited = true;
    this.cb.onExit(this.id, exitCode, signal);
  }

  /** Shown when the pane stays open after a non-zero exit. */
  notifyExitedWithError(exitCode: number, signal: number | null): void {
    const reason = signal ? `signal ${signal}` : `code ${exitCode}`;
    this.notice(`Process exited with ${reason}. Press Enter to restart, or close the pane.`, false);
  }

  restart(): void {
    if (this.disposed) return;
    if (this.ptyReady) {
      this.restarting = true;
      api().pty.kill(this.id);
    } else {
      this.term.write('\r\n');
      this.started = false;
      void this.start();
    }
  }

  /**
   * Replaces the shell in this pane. The new shell starts in the old one's working directory and the old process is
   * terminated only after the new one is running. Scrollback is kept. Returns false (leaving the session untouched)
   * if the new shell could not be started.
   */
  async switchShell(shellId: string): Promise<boolean> {
    if (this.disposed) return false;
    if (!this.ptyReady) {
      // The shell already exited (or never started): just start the chosen one.
      this.opts.shellId = shellId;
      this.exited = false;
      this.term.write('\r\n');
      this.started = false;
      void this.start();
      return true;
    }
    const res = await api().pty.respawn({ id: this.id, cols: this.term.cols, rows: this.term.rows, shellId });
    if (this.disposed) return false;
    if (!res.ok) {
      this.notice(`Could not switch shell: ${res.error}`, true);
      return false;
    }
    this.opts.shellId = shellId;
    this.lastSent = { cols: this.term.cols, rows: this.term.rows };
    this.term.write(`\r\n\x1b[2m[switched to ${res.shell}]\x1b[0m\r\n`);
    this.cb.onStarted(this.id, res.shell, res.cwd, res.shellId, res.fellBackFrom);
    this.queueResize();
    return true;
  }

  async info(): Promise<PtyInfo> {
    return api().pty.info(this.id);
  }

  private notice(text: string, error: boolean): void {
    this.term.write(`\r\n\x1b[${error ? '31' : '2'}m[${text}]\x1b[0m\r\n`);
  }

  private queueResize(): void {
    if (!this.ptyReady) return;
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    // Throttle SIGWINCH while a split divider or the window is being dragged.
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      const { cols, rows } = this.term;
      if (cols !== this.lastSent.cols || rows !== this.lastSent.rows) {
        this.lastSent = { cols, rows };
        api().pty.resize(this.id, cols, rows);
      }
    }, 24);
  }

  // ---- clipboard, selection, search -------------------------------------------------------

  async copy(): Promise<boolean> {
    if (!this.term.hasSelection()) return false;
    await api().clipboard.writeText(this.term.getSelection());
    return true;
  }

  async paste(): Promise<void> {
    const text = await api().clipboard.readText();
    if (text) this.term.paste(text);
    this.focus();
  }

  hasSelection(): boolean {
    return this.term.hasSelection();
  }

  selectAll(): void {
    this.term.selectAll();
  }

  clear(): void {
    this.term.clear();
    this.term.write('\x1b[2J\x1b[3J\x1b[H'); // also clears what remains of the visible screen
    api().pty.write(this.id, '\x0c'); // let the shell redraw its prompt (Ctrl+L)
  }

  private onSelectionChange(): void {
    if (!this.config.copyOnSelect) return;
    if (this.selectionTimer) clearTimeout(this.selectionTimer);
    this.selectionTimer = setTimeout(() => {
      if (this.term.hasSelection()) void api().clipboard.writeText(this.term.getSelection());
    }, 80);
  }

  private flashBell(): void {
    this.element.classList.add('bell');
    if (this.bellTimer) clearTimeout(this.bellTimer);
    this.bellTimer = setTimeout(() => this.element.classList.remove('bell'), 180);
  }

  private searchOptions(opts: { caseSensitive: boolean; regex: boolean; wholeWord: boolean }, incremental: boolean): ISearchOptions {
    return {
      ...opts,
      incremental,
      decorations: {
        matchBackground: this.config.search.match,
        activeMatchBackground: this.config.search.active,
        matchOverviewRuler: this.config.search.ruler,
        activeMatchColorOverviewRuler: this.config.search.ruler
      }
    };
  }

  find(query: string, opts: { caseSensitive: boolean; regex: boolean; wholeWord: boolean }, direction: 'next' | 'prev', incremental = false): boolean {
    if (!query) {
      this.searchAddon.clearDecorations();
      for (const l of this.searchListeners) l({ index: -1, count: 0 });
      return false;
    }
    const o = this.searchOptions(opts, incremental);
    return direction === 'next' ? this.searchAddon.findNext(query, o) : this.searchAddon.findPrevious(query, o);
  }

  clearSearch(): void {
    this.searchAddon.clearDecorations();
    this.term.clearSelection();
  }

  onSearchResults(cb: (s: SearchState) => void): () => void {
    this.searchListeners.add(cb);
    return () => this.searchListeners.delete(cb);
  }

  // ---- teardown -----------------------------------------------------------------------------

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.fitFrame);
    for (const t of [this.resizeTimer, this.ackTimer, this.selectionTimer, this.bellTimer]) if (t) clearTimeout(t);
    if (this.ptyReady || this.started) api().pty.kill(this.id);
    this.searchListeners.clear();
    this.unloadWebgl();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.term.dispose();
    this.element.remove();
  }
}
