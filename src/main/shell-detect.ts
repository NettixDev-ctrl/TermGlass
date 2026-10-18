// Platform shell discovery. Everything here is pure with respect to its `DetectDeps`, so Linux, Windows and WSL
// detection can be unit-tested with a fake filesystem. Nothing is executed through a shell: the only processes
// started are `wsl.exe` queries, launched with an argument vector.
import { posix, win32 } from 'node:path';
import type { ShellKind } from '../shared/types';

export interface DetectDeps {
  platform: 'linux' | 'win32' | 'darwin';
  env: Record<string, string | undefined>;
  /** The file exists, is a regular file (or an app-execution alias on Windows) and can be executed. */
  isLaunchable(path: string): boolean;
  realpath(path: string): string;
  readFile(path: string): string | null;
  listDir(path: string): string[];
  /** The account's login shell from the user database (os.userInfo().shell). */
  userShell(): string | null;
  /** Runs an executable (no shell) and returns its stdout, or null on failure or timeout. */
  run(file: string, args: string[], timeoutMs: number): Buffer | null;
}

export interface RawShell {
  /** Stable identifier base; the catalog makes ids unique. */
  id: string;
  name: string;
  path: string;
  args: string[];
  kind: ShellKind;
  detail?: string;
  /** Accepts `-l` to start a login shell. */
  loginCapable: boolean;
}

export interface Detection {
  shells: RawShell[];
  /** Index into `shells` of the system default shell, or -1 when it was not among the detected shells. */
  defaultIndex: number;
}

export const FRIENDLY_NAMES: Record<string, string> = {
  bash: 'Bash',
  zsh: 'Zsh',
  fish: 'Fish',
  nu: 'Nushell',
  dash: 'Dash',
  sh: 'sh',
  elvish: 'Elvish',
  xonsh: 'Xonsh',
  ksh: 'KornShell',
  mksh: 'mksh',
  ash: 'Ash',
  tcsh: 'tcsh',
  csh: 'csh',
  osh: 'Oils (osh)',
  ysh: 'Oils (ysh)',
  murex: 'Murex',
  ion: 'Ion',
  yash: 'yash',
  rc: 'rc',
  pwsh: 'PowerShell',
  powershell: 'Windows PowerShell',
  cmd: 'Command Prompt',
  'git-bash': 'Git Bash'
};

/** Shells searched for on PATH in addition to /etc/shells (the list only seeds the search, nothing is assumed installed). */
const PATH_SEARCH = ['bash', 'zsh', 'fish', 'nu', 'dash', 'sh', 'elvish', 'xonsh', 'ksh', 'mksh', 'ash', 'tcsh', 'csh', 'pwsh', 'osh', 'ysh', 'murex', 'ion', 'yash', 'rc'];
const LOGIN_CAPABLE = new Set(['bash', 'zsh', 'fish', 'sh', 'dash', 'ksh', 'mksh', 'tcsh', 'csh', 'nu', 'elvish', 'ash']);
/** Entries of /etc/shells that are not interactive shells. */
const NOT_A_SHELL = new Set(['nologin', 'false', 'true', 'git-shell', 'sync', 'shutdown', 'halt', 'reboot', 'rbash', 'sulogin']);
/** Placeholders that distributions list in /etc/shells but that are not interactive shells (e.g. systemd-home-fallback-shell). */
const isNotAShell = (base: string) => NOT_A_SHELL.has(base) || /(^|[-_])nologin$|fallback-shell$/.test(base);

const slug = (s: string) => s.toLowerCase().replace(/\.exe$/i, '').replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'shell';

// ---- Unix ---------------------------------------------------------------------------------------------------------

export function parseEtcShells(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#') && posix.isAbsolute(t) && !/\s/.test(t)) out.push(t);
  }
  return out;
}

export function unixSearchDirs(env: DetectDeps['env']): string[] {
  const home = env.HOME ?? '';
  const fromPath = (env.PATH ?? '').split(':').filter(Boolean);
  // GUI launchers often provide a minimal PATH, so well-known locations are searched as well.
  const extra = ['/usr/local/bin', '/usr/bin', '/bin', '/opt/homebrew/bin', '/home/linuxbrew/.linuxbrew/bin', '/snap/bin'];
  if (home) extra.push(`${home}/.cargo/bin`, `${home}/.nix-profile/bin`, `${home}/.local/bin`);
  return [...new Set([...fromPath, ...extra])];
}

export function detectUnix(d: DetectDeps): Detection {
  const seen = new Map<string, RawShell>();
  const keyOf = (p: string) => {
    let real = p;
    try {
      real = d.realpath(p);
    } catch {
      /* keep the given path */
    }
    // Different names for the same binary (/bin/bash vs /usr/bin/bash) collapse, but `sh` -> bash stays separate.
    return `${real}|${posix.basename(p)}`;
  };
  const add = (p: string | null | undefined): string | null => {
    if (!p || !posix.isAbsolute(p)) return null;
    const base = posix.basename(p);
    if (isNotAShell(base) || !d.isLaunchable(p)) return null;
    const key = keyOf(p);
    if (!seen.has(key)) {
      const id = slug(base);
      seen.set(key, { id, name: FRIENDLY_NAMES[id] ?? base, path: p, args: [], kind: 'detected', loginCapable: LOGIN_CAPABLE.has(id) });
    }
    return key;
  };

  const loginKey = add(d.userShell());
  const envKey = add(d.env.SHELL);
  for (const p of parseEtcShells(d.readFile('/etc/shells') ?? '')) add(p);
  const dirs = unixSearchDirs(d.env);
  for (const name of PATH_SEARCH) {
    for (const dir of dirs) {
      if (add(posix.join(dir, name))) break;
    }
  }

  const shells = [...seen.values()];
  const defaultKey = loginKey ?? envKey;
  const defaultShell = defaultKey ? seen.get(defaultKey) : undefined;
  return { shells, defaultIndex: defaultShell ? shells.indexOf(defaultShell) : -1 };
}

// ---- Windows --------------------------------------------------------------------------------------------------------

/** Decodes `wsl.exe` output: UTF-16LE by default, UTF-8 when WSL_UTF8 is set. */
export function decodeWslOutput(buf: Buffer): string {
  const hasNul = buf.includes(0);
  return (hasNul ? buf.toString('utf16le') : buf.toString('utf8')).replace(/^\uFEFF/, '').replace(/\0/g, '');
}

const DISTRO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Parses `wsl --list --quiet`. Docker's internal distributions are not usable shells and are skipped. */
export function parseWslDistros(buf: Buffer | null): string[] {
  if (!buf) return [];
  const names = decodeWslOutput(buf)
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s*\(Default\)$/i, ''))
    .filter((l) => DISTRO_RE.test(l) && !/^docker-desktop/i.test(l));
  return [...new Set(names)];
}

export function detectWindows(d: DetectDeps): Detection {
  const env = (name: string) => {
    const key = Object.keys(d.env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? d.env[key] : undefined;
  };
  const sysRoot = env('SystemRoot') ?? 'C:\\Windows';
  const system32 = win32.join(sysRoot, 'System32');
  const programFiles = [env('ProgramW6432'), env('ProgramFiles'), env('ProgramFiles(x86)')].filter((p): p is string => !!p);
  const localAppData = env('LOCALAPPDATA');
  const pathDirs = (env('PATH') ?? '').split(';').filter(Boolean);

  const seen = new Map<string, RawShell>();
  const add = (shell: Omit<RawShell, 'loginCapable'>): boolean => {
    const key = shell.kind === 'wsl' ? `wsl|${shell.id}` : shell.path.toLowerCase();
    if (seen.has(key) || !d.isLaunchable(shell.path)) return false;
    seen.set(key, { ...shell, loginCapable: false });
    return true;
  };
  const findOnPath = (exe: string, reject?: (full: string) => boolean): string | null => {
    for (const dir of pathDirs) {
      const full = win32.join(dir, exe);
      if (!(reject?.(full)) && d.isLaunchable(full)) return full;
    }
    return null;
  };

  // PowerShell 7+: PATH, the per-version Program Files folders, and the Store alias.
  const pwshCandidates = [findOnPath('pwsh.exe')];
  for (const pf of programFiles) {
    const dir = win32.join(pf, 'PowerShell');
    for (const entry of d.listDir(dir).sort().reverse()) pwshCandidates.push(win32.join(dir, entry, 'pwsh.exe'));
  }
  if (localAppData) pwshCandidates.push(win32.join(localAppData, 'Microsoft', 'WindowsApps', 'pwsh.exe'));
  for (const p of pwshCandidates) if (p && add({ id: 'pwsh', name: FRIENDLY_NAMES.pwsh!, path: p, args: ['-NoLogo'], kind: 'detected' })) break;

  add({ id: 'powershell', name: FRIENDLY_NAMES.powershell!, path: win32.join(system32, 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoLogo'], kind: 'detected' });
  const comspec = env('ComSpec');
  const cmdPath = comspec && /cmd\.exe$/i.test(comspec) ? comspec : win32.join(system32, 'cmd.exe');
  add({ id: 'cmd', name: FRIENDLY_NAMES.cmd!, path: cmdPath, args: [], kind: 'detected' });

  // Git Bash: standard install folders, then derived from git.exe on PATH. System32\bash.exe is the WSL launcher.
  const gitBashCandidates: string[] = [];
  for (const pf of programFiles) gitBashCandidates.push(win32.join(pf, 'Git', 'bin', 'bash.exe'));
  if (localAppData) gitBashCandidates.push(win32.join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe'));
  const git = findOnPath('git.exe');
  if (git) gitBashCandidates.push(win32.join(win32.dirname(win32.dirname(git)), 'bin', 'bash.exe'));
  for (const p of gitBashCandidates) if (add({ id: 'git-bash', name: FRIENDLY_NAMES['git-bash']!, path: p, args: ['--login', '-i'], kind: 'detected' })) break;

  // Other shells installed on PATH (MSYS2, Cygwin, Nushell, Elvish, ...), excluding the WSL launcher.
  const isWslLauncher = (full: string) => win32.dirname(full).toLowerCase() === system32.toLowerCase();
  for (const name of ['bash', 'zsh', 'fish', 'nu', 'elvish', 'xonsh']) {
    const found = findOnPath(`${name}.exe`, isWslLauncher);
    if (found) add({ id: name, name: FRIENDLY_NAMES[name] ?? name, path: found, args: name === 'bash' || name === 'zsh' || name === 'fish' ? ['-l'] : [], kind: 'detected' });
  }

  // WSL: one entry per distribution (its default shell); for running distributions also its other login shells.
  const wsl = win32.join(system32, 'wsl.exe');
  if (d.isLaunchable(wsl)) {
    const distros = parseWslDistros(d.run(wsl, ['--list', '--quiet'], 4000));
    const running = new Set(parseWslDistros(d.run(wsl, ['--list', '--running', '--quiet'], 4000)));
    for (const distro of distros) {
      add({ id: `wsl-${slug(distro)}`, name: `${distro} (WSL)`, path: wsl, args: ['-d', distro], kind: 'wsl', detail: distro });
      if (!running.has(distro)) continue; // never boot a stopped distribution just to look around
      const listing = d.run(wsl, ['-d', distro, '--exec', 'cat', '/etc/shells'], 4000);
      for (const shellPath of parseEtcShells(listing ? decodeWslOutput(listing) : '')) {
        const base = posix.basename(shellPath);
        const id = slug(base);
        if (isNotAShell(base) || !PATH_SEARCH.includes(id)) continue;
        add({
          id: `wsl-${slug(distro)}-${id}`,
          name: `${distro} · ${FRIENDLY_NAMES[id] ?? base}`,
          path: wsl,
          args: ['-d', distro, '--exec', shellPath, ...(LOGIN_CAPABLE.has(id) ? ['-l'] : [])],
          kind: 'wsl',
          detail: distro
        });
      }
    }
  }

  const shells = [...seen.values()];
  // Windows has no per-user login shell; prefer the most capable shell that is installed.
  const preferred = shells.find((s) => s.id === 'pwsh') ?? shells.find((s) => s.id === 'powershell') ?? shells.find((s) => s.id === 'cmd');
  return { shells, defaultIndex: preferred ? shells.indexOf(preferred) : -1 };
}

export function detectShells(d: DetectDeps): Detection {
  return d.platform === 'win32' ? detectWindows(d) : detectUnix(d);
}
