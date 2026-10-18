import type { TermGlassApi, Unsubscribe } from '@shared/types';
import type { TerminalConfig } from './config';
import { TerminalSession, type SessionCallbacks, type SessionOptions } from './TerminalSession';

/** Keeps every live TerminalSession and routes PTY events to the right one. */
class TerminalRegistry {
  private sessions = new Map<string, TerminalSession>();
  private subs: Unsubscribe[] = [];
  private config: TerminalConfig | null = null;

  init(api: TermGlassApi, config: TerminalConfig): void {
    this.config = config;
    this.subs.push(
      api.pty.onData((id, data) => this.sessions.get(id)?.write(data)),
      api.pty.onExit((id, code, signal) => this.sessions.get(id)?.handleExit(code, signal))
    );
  }

  create(id: string, opts: SessionOptions, cb: SessionCallbacks): TerminalSession {
    if (!this.config) throw new Error('Terminal registry is not initialised');
    const session = new TerminalSession(id, opts, this.config, cb);
    this.sessions.set(id, session);
    return session;
  }

  get(id: string | null | undefined): TerminalSession | undefined {
    return id ? this.sessions.get(id) : undefined;
  }

  dispose(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    s.dispose();
  }

  setConfig(config: TerminalConfig): void {
    this.config = config;
    for (const s of this.sessions.values()) s.applyConfig(config);
  }

  get size(): number {
    return this.sessions.size;
  }

  ids(): string[] {
    return [...this.sessions.keys()];
  }
}

export const registry = new TerminalRegistry();
