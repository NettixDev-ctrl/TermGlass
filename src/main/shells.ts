import { accessSync, constants, readdirSync, readFileSync, realpathSync, statSync, lstatSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { basename } from 'node:path';
import { isAbsoluteExecutablePath } from '../shared/settings';
import { parseShellArgs } from '../shared/shell-args';
import type { Settings, ShellInfo, ShellListResult, ShellProblem } from '../shared/types';
import { detectShells, type DetectDeps, type RawShell } from './shell-detect';

export interface ResolvedShell {
  info: ShellInfo;
  args: string[];
  /** The id that was asked for but is not available (the shell was removed or the id is stale). */
  fellBackFrom?: string;
}

export function createRealDeps(): DetectDeps {
  const win = process.platform === 'win32';
  return {
    platform: process.platform as DetectDeps['platform'],
    env: process.env,
    isLaunchable(p) {
      try {
        if (statSync(p).isFile()) {
          if (!win) accessSync(p, constants.X_OK);
          return true;
        }
        return false;
      } catch {
        // Windows app-execution aliases (e.g. the Store's pwsh.exe) cannot be stat'ed but do exist.
        if (!win) return false;
        try {
          return lstatSync(p).isFile() || lstatSync(p).isSymbolicLink();
        } catch {
          return false;
        }
      }
    },
    realpath: (p) => realpathSync(p),
    readFile(p) {
      try {
        return readFileSync(p, 'utf8');
      } catch {
        return null;
      }
    },
    listDir(p) {
      try {
        return readdirSync(p);
      } catch {
        return [];
      }
    },
    userShell() {
      try {
        return win ? null : userInfo().shell;
      } catch {
        return null;
      }
    },
    run(file, args, timeoutMs) {
      try {
        return execFileSync(file, args, { timeout: timeoutMs, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 20 });
      } catch {
        return null;
      }
    }
  };
}

/** Finds installed shells, merges the user's custom shells and turns an id into a launchable command. */
export class ShellCatalog {
  private cache: ShellListResult | null = null;

  constructor(
    private readonly getSettings: () => Settings,
    private readonly deps: DetectDeps = createRealDeps()
  ) {}

  /** Rescans the system. */
  scan(): ShellListResult {
    const settings = this.getSettings();
    const detection = detectShells(this.deps);
    const problems: ShellProblem[] = [];
    const usedIds = new Set<string>();
    const unique = (base: string) => {
      let id = base;
      for (let i = 2; usedIds.has(id); i++) id = `${base}-${i}`;
      usedIds.add(id);
      return id;
    };

    const shells: ShellInfo[] = detection.shells.map((raw: RawShell, index) => ({
      id: unique(raw.id),
      name: raw.name,
      path: raw.path,
      kind: raw.kind,
      args: raw.args,
      detail: raw.detail,
      isDefault: index === detection.defaultIndex
    }));
    // Without a user-database entry the first shell (bash when present) stands in as the default.
    if (!shells.some((s) => s.isDefault) && shells.length > 0) {
      const fallback = shells.findIndex((s) => s.id === 'bash');
      const i = fallback >= 0 ? fallback : 0;
      shells[i] = { ...shells[i]!, isDefault: true };
    }

    for (const custom of settings.customShells) {
      usedIds.add(custom.id);
      const problem = this.validateCustom(custom.path, shells);
      if (problem) problems.push({ id: custom.id, message: problem });
      else shells.push({ id: custom.id, name: custom.name, path: custom.path, kind: 'custom', args: [], isDefault: false });
    }
    for (const [id, text] of Object.entries(settings.shellArgs)) {
      const parsed = parseShellArgs(text);
      if (!parsed.ok) problems.push({ id, message: `Startup arguments ignored: ${parsed.error}` });
    }

    const defaultShell = shells.find((s) => s.isDefault);
    this.cache = { shells, systemDefaultId: defaultShell?.id ?? null, problems };
    return this.cache;
  }

  list(): ShellListResult {
    return this.cache ?? this.scan();
  }

  /** Reason a custom shell path cannot be used, or null when it is fine. */
  private validateCustom(path: string, detected: ShellInfo[]): string | null {
    if (!isAbsoluteExecutablePath(path)) return 'Enter an absolute path to an executable.';
    if (!this.deps.isLaunchable(path)) return 'File not found, or it is not an executable file.';
    const base = basename(path.replace(/\\/g, '/')).toLowerCase();
    if (['nologin', 'false', 'true'].includes(base)) return 'This is not an interactive shell.';
    const clash = detected.find((s) => s.kind !== 'wsl' && s.path.toLowerCase() === path.toLowerCase());
    if (clash) return `Already detected as ${clash.name}.`;
    return null;
  }

  /**
   * Maps a shell id (never a path) to an executable and argument vector.
   * Falls back to the user's default shell and then the system default when an id is unknown.
   */
  resolve(requestedId: string | undefined, login: boolean): ResolvedShell | null {
    const settings = this.getSettings();
    const { shells } = this.list();
    const wanted = [requestedId, settings.shellId].filter((id): id is string => !!id && id !== 'auto');
    const found = wanted.map((id) => shells.find((s) => s.id === id)).find(Boolean);
    const info = found ?? shells.find((s) => s.isDefault) ?? shells[0];
    // Report a fallback for an explicit request and for a saved default that no longer exists.
    const asked = requestedId && requestedId !== 'auto' ? requestedId : settings.shellId !== 'auto' ? settings.shellId : undefined;
    const fellBackFrom = asked && info?.id !== asked ? asked : undefined;

    if (!info) {
      const fallback = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : '/bin/sh';
      if (process.platform !== 'win32' && !this.deps.isLaunchable(fallback)) return null;
      return { info: { id: 'fallback', name: basename(fallback), path: fallback, kind: 'detected', args: [], isDefault: true }, args: [], fellBackFrom };
    }

    const args = [...info.args];
    const loginCapable = info.kind === 'detected' && process.platform !== 'win32' && ['bash', 'zsh', 'fish', 'sh', 'dash', 'ksh', 'mksh', 'tcsh', 'csh', 'nu', 'elvish', 'ash'].includes(info.id.replace(/-\d+$/, ''));
    if (login && loginCapable) args.push('-l');
    const extra = settings.shellArgs[info.id];
    if (extra) {
      const parsed = parseShellArgs(extra);
      if (parsed.ok) args.push(...parsed.args);
    }
    return { info, args, fellBackFrom };
  }
}
