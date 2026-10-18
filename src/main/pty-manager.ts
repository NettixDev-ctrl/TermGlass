import * as pty from 'node-pty';
import { readlinkSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { homedir } from 'node:os';
import { LIMITS } from '../shared/ipc';
import type { PtyCreateRequest, PtyCreateResult, PtyInfo, PtyRespawnRequest, Settings } from '../shared/types';
import type { ShellCatalog } from './shells';

/** Output is coalesced into one IPC message per tick to keep the renderer responsive under heavy output. */
const FLUSH_INTERVAL_MS = 4;
const FLUSH_MAX_CHARS = 64 * 1024;
/** Pause the PTY when the renderer has this many unacknowledged characters in flight. */
const HIGH_WATER = 1_000_000;
const LOW_WATER = 250_000;

interface Session {
  id: string;
  proc: pty.IPty;
  shellBase: string;
  chunks: string[];
  buffered: number;
  timer: NodeJS.Timeout | null;
  unacked: number;
  paused: boolean;
  exited: boolean;
  /** Replaced by a newer session with the same id: its output and exit are ignored. */
  dead: boolean;
}

export interface PtyEvents {
  data(id: string, data: string): void;
  exit(id: string, exitCode: number, signal: number | null): void;
}

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPtyId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);

function cleanEnv(shellPath: string, version: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    // Do not leak Electron / npm / dev-server variables into user shells.
    if (k.startsWith('ELECTRON_') || k.startsWith('npm_') || k === 'NODE_ENV' || k === 'TERMGLASS_DEV_URL' || k === 'CHROME_DESKTOP' || k === 'INIT_CWD') continue;
    env[k] = v;
  }
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.TERM_PROGRAM = 'TermGlass';
  env.TERM_PROGRAM_VERSION = version;
  if (process.platform !== 'win32') {
    env.SHELL = shellPath;
    const hasUtf8 = /utf-?8/i.test(env.LC_ALL ?? env.LC_CTYPE ?? env.LANG ?? '');
    if (!hasUtf8 && !env.LC_ALL) env.LANG = 'en_US.UTF-8';
  }
  return env;
}

export class PtyManager {
  private sessions = new Map<string, Session>();
  /** Sessions replaced by respawn() that have not exited yet; they must still be cleaned up on quit. */
  private retiring = new Set<Session>();

  constructor(
    private readonly events: PtyEvents,
    private readonly shells: ShellCatalog,
    private readonly getSettings: () => Settings,
    private readonly version: string
  ) {}

  get size(): number {
    return this.sessions.size;
  }

  create(req: PtyCreateRequest): PtyCreateResult {
    if (this.sessions.has(req.id)) return { ok: false, error: 'A terminal with this id already exists.' };
    const spawned = this.spawn(req, this.pickCwd(req.cwdFrom, undefined));
    if (!spawned.ok) return spawned;
    this.sessions.set(req.id, spawned.session);
    return spawned.result;
  }

  /**
   * Starts a different shell behind an existing PTY id. The new shell is spawned first, in the old shell's working
   * directory; only when that succeeds is the old process terminated, so a failure leaves the session untouched.
   */
  respawn(req: PtyRespawnRequest): PtyCreateResult {
    const old = this.sessions.get(req.id);
    if (!old || old.exited) return { ok: false, error: 'This terminal is no longer running.' };
    const spawned = this.spawn({ id: req.id, cols: req.cols, rows: req.rows, shellId: req.shellId }, this.pickCwd(undefined, this.cwdOf(old)));
    if (!spawned.ok) return spawned;
    old.dead = true;
    this.retiring.add(old);
    this.sessions.set(req.id, spawned.session);
    this.terminate(old);
    return spawned.result;
  }

  private spawn(req: PtyCreateRequest, cwd: string): { ok: true; session: Session; result: Extract<PtyCreateResult, { ok: true }> } | { ok: false; error: string } {
    const settings = this.getSettings();
    const resolved = this.shells.resolve(req.shellId, settings.loginShell);
    if (!resolved) return { ok: false, error: 'No usable shell was found on this system.' };

    const cols = clamp(req.cols, LIMITS.minCols, LIMITS.maxCols);
    const rows = clamp(req.rows, LIMITS.minRows, LIMITS.maxRows);

    let proc: pty.IPty;
    try {
      proc = pty.spawn(resolved.info.path, resolved.args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: cleanEnv(resolved.info.path, this.version),
        encoding: 'utf8'
      });
    } catch (err) {
      return { ok: false, error: `Failed to start ${resolved.info.name}: ${err instanceof Error ? err.message : String(err)}` };
    }

    const s: Session = {
      id: req.id,
      proc,
      shellBase: shellBaseName(resolved.info.path),
      chunks: [],
      buffered: 0,
      timer: null,
      unacked: 0,
      paused: false,
      exited: false,
      dead: false
    };

    proc.onData((data) => {
      if (s.dead) return;
      s.chunks.push(data);
      s.buffered += data.length;
      if (s.buffered >= FLUSH_MAX_CHARS) this.flush(s);
      else if (!s.timer) s.timer = setTimeout(() => this.flush(s), FLUSH_INTERVAL_MS);
    });
    proc.onExit(({ exitCode, signal }) => {
      s.exited = true;
      this.retiring.delete(s);
      if (s.dead) return; // replaced by respawn(): the id now belongs to another session
      this.flush(s);
      if (this.sessions.get(s.id) === s) this.sessions.delete(s.id);
      this.events.exit(s.id, exitCode, signal ?? null);
    });

    return {
      ok: true,
      session: s,
      result: { ok: true, pid: proc.pid, shell: resolved.info.name, shellId: resolved.info.id, cwd, fellBackFrom: resolved.fellBackFrom }
    };
  }

  write(id: string, data: string): void {
    const s = this.sessions.get(id);
    if (!s || s.exited) return;
    s.proc.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const s = this.sessions.get(id);
    if (!s || s.exited) return;
    try {
      s.proc.resize(clamp(cols, LIMITS.minCols, LIMITS.maxCols), clamp(rows, LIMITS.minRows, LIMITS.maxRows));
    } catch {
      /* the process may have just exited */
    }
  }

  ack(id: string, count: number): void {
    const s = this.sessions.get(id);
    if (!s) return;
    s.unacked = Math.max(0, s.unacked - count);
    if (s.paused && s.unacked < LOW_WATER) {
      s.paused = false;
      s.proc.resume();
    }
  }

  kill(id: string): void {
    const s = this.sessions.get(id);
    if (!s) return;
    this.terminate(s);
  }

  info(id: string): PtyInfo {
    const s = this.sessions.get(id);
    if (!s || s.exited) return { alive: false, busy: false, process: null, cwd: null };
    let processName: string | null = null;
    try {
      processName = s.proc.process || null;
    } catch {
      processName = null;
    }
    // On Windows node-pty only reports the shell executable, so activity can't be detected there.
    const busy = process.platform !== 'win32' && !!processName && shellBaseName(processName) !== s.shellBase;
    return { alive: true, busy, process: processName, cwd: this.cwdOf(s) };
  }

  /** Terminates every session and resolves once they have exited (or after a short grace period). */
  async killAll(graceMs = 600): Promise<void> {
    const all = [...this.sessions.values(), ...this.retiring];
    for (const s of all) this.terminate(s, false);
    const deadline = Date.now() + graceMs;
    while ((this.sessions.size > 0 || this.retiring.size > 0) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    for (const s of [...this.sessions.values(), ...this.retiring]) {
      try {
        process.kill(s.proc.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }

  private terminate(s: Session, escalate = true): void {
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    s.chunks.length = 0;
    s.buffered = 0;
    // Resume first: a paused PTY would never deliver its exit event.
    if (s.paused) {
      s.paused = false;
      try {
        s.proc.resume();
      } catch {
        /* ignore */
      }
    }
    try {
      s.proc.kill();
    } catch {
      /* already dead */
    }
    if (escalate && process.platform !== 'win32') {
      setTimeout(() => {
        if (!s.exited) {
          try {
            process.kill(s.proc.pid, 'SIGKILL');
          } catch {
            /* gone */
          }
        }
      }, 1500).unref();
    }
  }

  private flush(s: Session): void {
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    if (s.dead || s.chunks.length === 0) return;
    const data = s.chunks.length === 1 ? s.chunks[0]! : s.chunks.join('');
    s.chunks.length = 0;
    s.buffered = 0;
    s.unacked += data.length;
    if (!s.paused && s.unacked > HIGH_WATER && !s.exited) {
      s.paused = true;
      s.proc.pause();
    }
    this.events.data(s.id, data);
  }

  private cwdOf(s: Session): string | null {
    if (process.platform === 'linux') {
      try {
        return readlinkSync(`/proc/${s.proc.pid}/cwd`);
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Chooses a starting directory: another PTY's cwd, an explicit hint, the configured default, then home. */
  private pickCwd(cwdFrom: string | undefined, hint: string | null | undefined): string {
    const candidates: (string | null | undefined)[] = [hint];
    if (cwdFrom && isPtyId(cwdFrom)) {
      const src = this.sessions.get(cwdFrom);
      candidates.unshift(src ? this.cwdOf(src) : null);
    }
    candidates.push(this.getSettings().cwd || null, homedir());
    for (const c of candidates) {
      if (!c) continue;
      try {
        if (statSync(c).isDirectory()) return c;
      } catch {
        /* try the next candidate */
      }
    }
    return homedir();
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(Number.isFinite(n) ? n : min)));
}

function shellBaseName(p: string): string {
  return basename(p).replace(/\.exe$/i, '').replace(/^-/, '').toLowerCase();
}
