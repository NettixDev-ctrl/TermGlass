// Unit tests for the pure logic (layout tree, fuzzy search, settings validation, themes, key bindings, colours).
// Bundles the TypeScript sources with esbuild into a temp file and runs plain node:assert checks.
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'termglass-unit-')), 'bundle.mjs');

await build({
  stdin: {
    contents: `
      export * as layout from './src/renderer/state/layout';
      export * as fuzzy from './src/renderer/state/fuzzy';
      export * as settings from './src/shared/settings';
      export * as themes from './src/shared/themes';
      export * as keys from './src/shared/keybindings';
      export * as color from './src/shared/color';
      export * as detect from './src/main/shell-detect';
      export * as shellsMod from './src/main/shells';
      export * as shellArgs from './src/shared/shell-args';
      export * as fonts from './src/main/fonts';
    `,
    resolveDir: root,
    loader: 'ts'
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error'
});

const { layout, fuzzy, settings, themes, keys, color, detect, shellsMod, shellArgs, fonts } = await import(pathToFileURL(out).href);
const { posix, win32 } = await import('node:path');
const assert = (await import('node:assert/strict')).default;

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    console.log(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
};

const leaf = (id) => ({ kind: 'leaf', id });

test('layout: splitting a leaf creates a split with the new pane second', () => {
  const t = layout.splitLeaf(leaf('a'), 'a', 'row', 'b', 's1');
  assert.equal(t.kind, 'split');
  assert.deepEqual(layout.leaves(t), ['a', 'b']);
  assert.equal(t.dir, 'row');
  assert.equal(t.ratio, 0.5);
});

test('layout: removing a leaf promotes its sibling; removing the last leaf yields null', () => {
  let t = layout.splitLeaf(leaf('a'), 'a', 'row', 'b', 's1');
  t = layout.splitLeaf(t, 'b', 'col', 'c', 's2');
  assert.deepEqual(layout.leaves(t), ['a', 'b', 'c']);
  const r = layout.removeLeaf(t, 'b');
  assert.deepEqual(layout.leaves(r), ['a', 'c']);
  assert.equal(layout.removeLeaf(leaf('x'), 'x'), null);
});

test('layout: ratios are clamped', () => {
  const t = layout.splitLeaf(leaf('a'), 'a', 'row', 'b', 's1');
  assert.equal(layout.setRatio(t, 's1', 0).ratio, layout.MIN_RATIO);
  assert.equal(layout.setRatio(t, 's1', 5).ratio, layout.MAX_RATIO);
  assert.equal(layout.setRatio(t, 's1', 0.3).ratio, 0.3);
});

test('layout: rectangles tile the unit square', () => {
  let t = layout.splitLeaf(leaf('a'), 'a', 'row', 'b', 's1');
  t = layout.splitLeaf(t, 'b', 'col', 'c', 's2');
  const rects = layout.computeRects(t);
  const area = [...rects.values()].reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(area - 1) < 1e-9);
  assert.deepEqual(rects.get('a'), { x: 0, y: 0, w: 0.5, h: 1 });
  assert.deepEqual(rects.get('c'), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
});

test('layout: directional focus picks the adjacent pane', () => {
  // a | (b over c)
  let t = layout.splitLeaf(leaf('a'), 'a', 'row', 'b', 's1');
  t = layout.splitLeaf(t, 'b', 'col', 'c', 's2');
  assert.equal(layout.findNeighbor(t, 'a', 'right'), 'b');
  assert.equal(layout.findNeighbor(t, 'c', 'left'), 'a');
  assert.equal(layout.findNeighbor(t, 'b', 'down'), 'c');
  assert.equal(layout.findNeighbor(t, 'c', 'up'), 'b');
  assert.equal(layout.findNeighbor(t, 'a', 'left'), null);
  assert.equal(layout.findNeighbor(t, 'c', 'down'), null);
});

test('layout: cycling wraps around', () => {
  let t = layout.splitLeaf(leaf('a'), 'a', 'row', 'b', 's1');
  t = layout.splitLeaf(t, 'b', 'row', 'c', 's2');
  assert.equal(layout.cycleLeaf(t, 'c', 1), 'a');
  assert.equal(layout.cycleLeaf(t, 'a', -1), 'c');
});

test('layout: computeSplits reports every split with its area', () => {
  let t = layout.splitLeaf(leaf('a'), 'a', 'row', 'b', 's1');
  t = layout.splitLeaf(t, 'b', 'col', 'c', 's2');
  const splits = layout.computeSplits(t);
  assert.deepEqual(splits.map((s) => s.id), ['s1', 's2']);
  assert.deepEqual(splits[1].rect, { x: 0.5, y: 0, w: 0.5, h: 1 });
});

test('fuzzy: matches abbreviations and rejects scattered matches', () => {
  assert.ok(fuzzy.fuzzyMatch('newtab', 'New Tab'));
  assert.ok(fuzzy.fuzzyMatch('splitr', 'Split Right'));
  assert.ok(fuzzy.fuzzyMatch('oled', 'Theme: OLED Black'));
  assert.equal(fuzzy.fuzzyMatch('oled', 'Toggle Developer Tools'), null);
  assert.equal(fuzzy.fuzzyMatch('xyz', 'New Tab'), null);
  assert.ok(fuzzy.fuzzyMatch('ns', 'New Split'));
});

test('fuzzy: prefix and word-start matches outrank scattered ones', () => {
  const a = fuzzy.fuzzyMatch('tab', 'Tab Manager');
  const b = fuzzy.fuzzyMatch('tab', 'Rotate Abstract Bits');
  assert.ok(b === null || a.score > b.score);
});

const base = settings.defaultSettings('linux');

test('settings: invalid values fall back and numbers are clamped', () => {
  const s = settings.sanitizeSettings({ fontSize: 9999, lineHeight: 'x', cursorShape: 'blob', scrollback: -5, windowOpacity: 0.1, themeId: '../etc/passwd' }, base);
  assert.equal(s.fontSize, 32);
  assert.equal(s.lineHeight, base.lineHeight);
  assert.equal(s.cursorShape, base.cursorShape);
  assert.equal(s.scrollback, 0);
  assert.equal(s.windowOpacity, 0.5);
  assert.equal(s.themeId, base.themeId);
});

test('settings: unknown keys are dropped and non-objects are ignored', () => {
  const s = settings.sanitizeSettings({ evil: 1, __proto__: { x: 1 }, fontSize: 15 }, base);
  assert.equal('evil' in s, false);
  assert.equal(s.fontSize, 15);
  assert.deepEqual(settings.sanitizeSettings('nope', base), base);
});

test('settings: keybinding overrides must be known commands with valid combos', () => {
  const s = settings.sanitizeSettings({ keybindings: { 'tab.new': 'Ctrl+Alt+N', 'not.a.command': 'Ctrl+X', 'tab.close': 'Banana+Q', 'pane.close': '' } }, base);
  assert.deepEqual(s.keybindings, { 'tab.new': 'Ctrl+Alt+N', 'pane.close': '' });
});

test('settings: patches are validated against current values', () => {
  const next = settings.applySettingsPatch(base, { fontSize: 18, accent: 'not-a-color', shellId: 'zsh' });
  assert.equal(next.fontSize, 18);
  assert.equal(next.accent, base.accent);
  assert.equal(next.shellId, 'zsh');
  assert.equal(settings.applySettingsPatch(base, null), base);
});

test('settings: font family cannot smuggle CSS', () => {
  const s = settings.sanitizeSettings({ fontFamily: 'Mono; } body { display:none' }, base);
  assert.equal(s.fontFamily, base.fontFamily);
});

test('themes: built-in terminal palettes are readable (WCAG contrast)', () => {
  for (const t of themes.BUILTIN_THEMES) {
    const bg = t.terminal.background;
    assert.ok(color.contrastRatio(t.terminal.foreground, bg) >= 7, `${t.name} foreground`);
    for (const k of ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'brightBlack']) {
      assert.ok(color.contrastRatio(t.terminal[k], bg) >= 3.5, `${t.name} ${k} = ${color.contrastRatio(t.terminal[k], bg).toFixed(2)}`);
    }
  }
});

test('themes: custom theme parsing fills defaults and rejects bad input', () => {
  const t = themes.parseCustomTheme({ name: 'Mine', type: 'dark', terminal: { background: '#101010', red: '#ff0000' } }, 'mine');
  assert.equal(t.id, 'mine');
  assert.equal(t.terminal.red, '#ff0000');
  assert.equal(t.terminal.green, themes.BUILTIN_THEMES[0].terminal.green);
  assert.equal(t.ui.background, '#101010');
  assert.throws(() => themes.parseCustomTheme({ type: 'dark', terminal: { red: 'javascript:alert(1)' } }, 'x'), /not a valid colour/);
  assert.throws(() => themes.parseCustomTheme({ type: 'purple' }, 'x'), /dark/);
  assert.throws(() => themes.parseCustomTheme({ id: 'frost', type: 'dark' }, 'x'), /reserved/);
  assert.throws(() => themes.parseCustomTheme([], 'x'));
});

test('keys: events map to canonical combos', () => {
  const ev = (o) => ({ code: 'KeyT', key: 't', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o });
  assert.equal(keys.comboFromEvent(ev({ ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+T');
  assert.equal(keys.comboFromEvent(ev({ code: 'Digit3', altKey: true })), 'Alt+3');
  assert.equal(keys.comboFromEvent(ev({ code: 'BracketLeft', ctrlKey: true, shiftKey: true })), 'Ctrl+Shift+[');
  assert.equal(keys.comboFromEvent(ev({ code: 'ShiftLeft', shiftKey: true })), null);
});

test('keys: user overrides win over defaults and disabled bindings are removed', () => {
  const map = keys.buildKeyMap({ 'tab.new': 'Ctrl+Shift+P', 'palette.open': '' }, 'linux');
  assert.equal(map.get('Ctrl+Shift+P'), 'tab.new');
  assert.equal([...map.values()].includes('palette.open'), false);
  assert.equal(keys.buildKeyMap({}, 'linux').get('Ctrl+Shift+P'), 'palette.open');
});

test('keys: default shortcuts have no duplicates per platform', () => {
  for (const platform of ['linux', 'win32', 'darwin']) {
    const seen = new Map();
    for (const def of keys.COMMANDS) {
      for (const combo of keys.splitAlternatives(keys.defaultKeys(def, platform))) {
        assert.ok(keys.isValidKeys(combo), `${def.id}: ${combo}`);
        assert.ok(!seen.has(combo), `${platform}: ${combo} used by ${seen.get(combo)} and ${def.id}`);
        seen.set(combo, def.id);
      }
    }
  }
});

test('colors: parsing and mixing', () => {
  assert.deepEqual(color.parseColor('#fff'), [255, 255, 255, 1]);
  assert.deepEqual(color.parseColor('rgba(10, 20, 30, 0.5)'), [10, 20, 30, 0.5]);
  assert.equal(color.parseColor('red'), null);
  assert.equal(color.mix('#000000', '#ffffff', 0.5), '#808080');
  assert.ok(color.contrastRatio('#000', '#fff') > 20.9);
});


// ---- shell arguments -------------------------------------------------------------------------------------------

test('shell args: split on whitespace, honour quotes, never invoke a shell', () => {
  assert.deepEqual(shellArgs.parseShellArgs('-l --no-rc').args, ['-l', '--no-rc']);
  assert.deepEqual(shellArgs.parseShellArgs(`-c "echo hi there" 'a b' c\\ d`).args, ['-c', 'echo hi there', 'a b', 'c\\', 'd']);
  assert.deepEqual(shellArgs.parseShellArgs('').args, []);
  assert.deepEqual(shellArgs.parseShellArgs('   ').args, []);
  assert.deepEqual(shellArgs.parseShellArgs('""').args, ['']);
  assert.deepEqual(shellArgs.parseShellArgs('--x="a b"').args, ['--x=a b']);
  // Shell metacharacters are plain text: there is no expansion or command substitution.
  assert.deepEqual(shellArgs.parseShellArgs('$(rm -rf ~) `id` ; | &').args, ['$(rm', '-rf', '~)', '`id`', ';', '|', '&']);
});

test('shell args: invalid input is rejected with a reason', () => {
  assert.equal(shellArgs.parseShellArgs('"unclosed').ok, false);
  assert.equal(shellArgs.parseShellArgs("it's").ok, false);
  assert.equal(shellArgs.parseShellArgs('a\nb').ok, false);
  assert.equal(shellArgs.parseShellArgs('x'.repeat(600)).ok, false);
  assert.equal(shellArgs.parseShellArgs(Array(40).fill('a').join(' ')).ok, false);
  assert.equal(shellArgs.parseShellArgs('y'.repeat(300)).ok, false);
});

test('settings: custom shells need an absolute path and a valid id; extras are dropped', () => {
  const s = settings.sanitizeSettings(
    {
      customShells: [
        { id: 'custom-abc1', name: 'Mine', path: '/opt/mine/bin/sh' },
        { id: 'custom-abc1', name: 'Dup', path: '/opt/other' },
        { id: 'bad id', name: 'x', path: '/bin/sh' },
        { id: 'custom-rel', name: 'x', path: 'bin/sh' },
        { id: 'custom-win', name: 'W', path: 'C:\\Tools\\sh.exe' },
        { id: 'custom-nul', name: 'x', path: '/bin/sh\0' },
        'junk'
      ],
      shellArgs: { bash: '--norc', 'bad id!': 'x', zsh: 'a\nb', fish: '' }
    },
    base
  );
  assert.deepEqual(s.customShells.map((c) => c.id), ['custom-abc1', 'custom-win']);
  assert.deepEqual(s.shellArgs, { bash: '--norc' });
  const many = settings.sanitizeSettings({ customShells: Array.from({ length: 40 }, (_, i) => ({ id: `custom-n${i}`, name: 'n', path: '/bin/sh' })) }, base);
  assert.equal(many.customShells.length, settings.MAX_CUSTOM_SHELLS);
});

// ---- shell detection (fake filesystems) ---------------------------------------------------------------------

const unixDeps = (files, over = {}) => ({
  platform: 'linux',
  env: { HOME: '/home/u', PATH: '/usr/local/bin:/usr/bin:/bin', ...over.env },
  isLaunchable: (p) => p in files && files[p] !== null,
  realpath: (p) => files[p] ?? p,
  readFile: (p) => over.readFile?.(p) ?? null,
  listDir: () => [],
  userShell: () => over.userShell ?? null,
  run: () => null
});

const linuxFiles = {
  '/usr/bin/bash': '/usr/bin/bash',
  '/bin/bash': '/usr/bin/bash',
  '/usr/bin/zsh': '/usr/bin/zsh',
  '/usr/bin/fish': '/usr/bin/fish',
  '/usr/bin/nu': '/usr/bin/nu',
  '/usr/bin/elvish': '/usr/bin/elvish',
  '/usr/bin/dash': '/usr/bin/dash',
  '/usr/bin/sh': '/usr/bin/bash', // Arch: sh is a symlink to bash
  '/usr/bin/nologin': '/usr/bin/nologin',
  '/usr/bin/git-shell': '/usr/bin/git-shell',
  '/usr/bin/systemd-home-fallback-shell': '/usr/bin/systemd-home-fallback-shell'
};
const etcShells = `# /etc/shells
/bin/sh
/bin/bash
/usr/bin/bash
/usr/bin/zsh
/usr/bin/nologin
/usr/bin/git-shell
/usr/bin/systemd-home-fallback-shell
/usr/bin/ghost-shell
not-absolute
`;

test('detect (Unix): finds shells dynamically, skips non-shells and missing files, dedupes by path', () => {
  const d = unixDeps(linuxFiles, { userShell: '/usr/bin/zsh', readFile: (p) => (p === '/etc/shells' ? etcShells : null) });
  const { shells, defaultIndex } = detect.detectUnix(d);
  const names = shells.map((s) => s.id);
  for (const id of ['bash', 'zsh', 'fish', 'nu', 'elvish', 'dash', 'sh']) assert.ok(names.includes(id), `missing ${id}: ${names}`);
  assert.equal(names.filter((n) => n === 'bash').length, 1, '/bin/bash and /usr/bin/bash are one shell');
  assert.ok(!names.includes('nologin') && !names.includes('git-shell') && !names.includes('ghost-shell'));
  assert.ok(!names.some((n) => n.includes('fallback')), 'systemd-home-fallback-shell is not a user shell');
  assert.equal(shells[defaultIndex].id, 'zsh');
  assert.equal(shells[0].id, 'zsh', 'the login shell is listed first');
  // /bin/sh is listed in /etc/shells but absent here, so sh comes from PATH; it resolves to bash yet stays its own entry.
  assert.equal(shells.find((s) => s.id === 'sh').path, '/usr/bin/sh');
});

test('detect (Unix): $SHELL is the fallback default, and an unusable default yields no default', () => {
  const d = unixDeps(linuxFiles, { env: { SHELL: '/usr/bin/fish' } });
  const r = detect.detectUnix(d);
  assert.equal(r.shells[r.defaultIndex].id, 'fish');
  const none = detect.detectUnix(unixDeps(linuxFiles, { userShell: '/usr/bin/vanished' }));
  assert.equal(none.defaultIndex, -1);
});

test('detect (Unix): nothing installed means nothing listed (no assumed shells)', () => {
  const r = detect.detectUnix(unixDeps({}));
  assert.deepEqual(r.shells, []);
});

test('detect (Unix): the same name in two real locations stays distinct', () => {
  const files = { '/usr/bin/bash': '/usr/bin/bash', '/opt/homebrew/bin/bash': '/opt/homebrew/Cellar/bash/5.2/bin/bash' };
  const r = detect.detectUnix(unixDeps(files, { readFile: (p) => (p === '/etc/shells' ? '/usr/bin/bash\n/opt/homebrew/bin/bash\n' : null) }));
  assert.equal(r.shells.filter((s) => s.id === 'bash').length, 2);
});

test('detect: WSL output decoding handles UTF-16LE, BOM, "(Default)" and Docker distros', () => {
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Ubuntu (Default)\r\nDebian\r\ndocker-desktop\r\ndocker-desktop-data\r\n', 'utf16le')]);
  assert.deepEqual(detect.parseWslDistros(utf16), ['Ubuntu', 'Debian']);
  assert.deepEqual(detect.parseWslDistros(Buffer.from('Arch\nFedora-40\n', 'utf8')), ['Arch', 'Fedora-40']);
  assert.deepEqual(detect.parseWslDistros(null), []);
  assert.deepEqual(detect.parseWslDistros(Buffer.from('Copyright (c) Microsoft\r\nUsage: wsl.exe [Argument]\r\n', 'utf8')), []);
});

const winEnv = {
  SystemRoot: 'C:\\Windows',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local',
  ComSpec: 'C:\\Windows\\System32\\cmd.exe',
  PATH: 'C:\\Windows\\System32;C:\\Program Files\\Git\\cmd'
};
const w = (...p) => win32.join(...p).toLowerCase();

function winDeps(present, runMap = {}) {
  const set = new Set(present.map((p) => p.toLowerCase()));
  return {
    platform: 'win32',
    env: winEnv,
    isLaunchable: (p) => set.has(p.toLowerCase()),
    realpath: (p) => p,
    readFile: () => null,
    listDir: (p) => (p.toLowerCase() === 'c:\\program files\\powershell' ? ['6', '7', '7-preview'] : []),
    userShell: () => null,
    run: (file, args) => runMap[args.join(' ')] ?? null
  };
}

const winFiles = [
  'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  'C:\\Windows\\System32\\cmd.exe',
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Windows\\System32\\bash.exe', // the WSL launcher, not a shell of its own
  'C:\\Windows\\System32\\wsl.exe'
];
const wslRun = {
  '--list --quiet': Buffer.from('Ubuntu (Default)\r\nDebian\r\ndocker-desktop\r\n', 'utf16le'),
  '--list --running --quiet': Buffer.from('Ubuntu\r\n', 'utf16le'),
  '-d Ubuntu --exec cat /etc/shells': Buffer.from('# shells\n/bin/sh\n/bin/bash\n/usr/bin/zsh\n/usr/sbin/nologin\n/usr/bin/ghost\n', 'utf8')
};

test('detect (Windows): pwsh 7, Windows PowerShell, cmd, Git Bash and WSL distributions', () => {
  const r = detect.detectWindows(winDeps(winFiles, wslRun));
  const ids = r.shells.map((s) => s.id);
  assert.deepEqual(ids.slice(0, 4), ['pwsh', 'powershell', 'cmd', 'git-bash']);
  assert.ok(ids.includes('wsl-ubuntu') && ids.includes('wsl-debian'));
  assert.ok(!ids.some((i) => i.includes('docker')), 'docker-desktop distros are skipped');
  assert.ok(ids.includes('wsl-ubuntu-bash') && ids.includes('wsl-ubuntu-zsh') && ids.includes('wsl-ubuntu-sh'), ids.join());
  assert.ok(!ids.includes('wsl-ubuntu-ghost'), 'only known shells are offered inside a distro');
  assert.ok(!ids.includes('wsl-debian-bash'), 'a stopped distro is never booted just to look around');
  assert.equal(r.shells[r.defaultIndex].id, 'pwsh');
  assert.equal(r.shells.find((s) => s.id === 'git-bash').path, 'C:\\Program Files\\Git\\bin\\bash.exe');
  assert.deepEqual(r.shells.find((s) => s.id === 'git-bash').args, ['--login', '-i']);
  assert.deepEqual(r.shells.find((s) => s.id === 'wsl-debian').args, ['-d', 'Debian']);
  assert.deepEqual(r.shells.find((s) => s.id === 'wsl-ubuntu-zsh').args, ['-d', 'Ubuntu', '--exec', '/usr/bin/zsh', '-l']);
  assert.ok(!r.shells.some((s) => s.path.toLowerCase() === 'c:\\windows\\system32\\bash.exe'), 'WSL launcher is not listed as Git Bash');
});

test('detect (Windows): only what exists is listed; Windows PowerShell becomes the default without pwsh', () => {
  const r = detect.detectWindows(winDeps(['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'C:\\Windows\\System32\\cmd.exe']));
  assert.deepEqual(r.shells.map((s) => s.id), ['powershell', 'cmd']);
  assert.equal(r.shells[r.defaultIndex].id, 'powershell');
  assert.deepEqual(detect.detectWindows(winDeps([])).shells, []);
});

test('detect (Windows): Git Bash is found next to git.exe on PATH, and wsl.exe failure yields no WSL entries', () => {
  const env = { ...winEnv, ProgramFiles: undefined, 'ProgramFiles(x86)': undefined, PATH: 'D:\\Dev\\Git\\cmd' };
  const d = { ...winDeps(['D:\\Dev\\Git\\cmd\\git.exe', 'D:\\Dev\\Git\\bin\\bash.exe', 'C:\\Windows\\System32\\wsl.exe']), env };
  const r = detect.detectWindows(d);
  assert.equal(r.shells.find((s) => s.id === 'git-bash')?.path, 'D:\\Dev\\Git\\bin\\bash.exe');
  assert.ok(!r.shells.some((s) => s.kind === 'wsl'));
});

// ---- catalog: custom shells, arguments, fallback ------------------------------------------------------------

function makeCatalog(settingsOver = {}, files = linuxFiles) {
  const st = { ...settings.defaultSettings('linux'), ...settingsOver };
  const d = unixDeps({ ...files, '/opt/tools/mysh': '/opt/tools/mysh' }, { userShell: '/usr/bin/zsh', readFile: (p) => (p === '/etc/shells' ? etcShells : null) });
  return { catalog: new shellsMod.ShellCatalog(() => st, d), st };
}

test('catalog: marks the system default and lists custom shells that are valid', () => {
  const { catalog } = makeCatalog({ customShells: [{ id: 'custom-a1', name: 'My Shell', path: '/opt/tools/mysh' }] });
  const r = catalog.scan();
  assert.equal(r.systemDefaultId, 'zsh');
  assert.equal(r.shells.filter((s) => s.isDefault).length, 1);
  const custom = r.shells.find((s) => s.id === 'custom-a1');
  assert.equal(custom.kind, 'custom');
  assert.equal(custom.name, 'My Shell');
  assert.deepEqual(r.problems, []);
});

test('catalog: unusable custom shells are reported, never listed', () => {
  const { catalog } = makeCatalog({
    customShells: [
      { id: 'custom-gone', name: 'Gone', path: '/opt/tools/does-not-exist' },
      { id: 'custom-dup', name: 'Dup', path: '/usr/bin/zsh' },
      { id: 'custom-rel', name: 'Rel', path: '/usr/bin/nologin' }
    ]
  });
  const r = catalog.scan();
  assert.ok(!r.shells.some((s) => s.kind === 'custom'));
  assert.equal(r.problems.length, 3);
  assert.match(r.problems.find((p) => p.id === 'custom-gone').message, /not found|not an executable/);
  assert.match(r.problems.find((p) => p.id === 'custom-dup').message, /Already detected/);
});

test('catalog: resolve falls back from a removed shell and reports it', () => {
  const { catalog } = makeCatalog({ shellId: 'ghost' });
  const viaDefault = catalog.resolve(undefined, false);
  assert.equal(viaDefault.info.id, 'zsh', 'a stale default falls back to the system default');
  assert.equal(viaDefault.fellBackFrom, 'ghost', 'and the user is told about it');
  assert.equal(makeCatalog({ shellId: 'auto' }).catalog.resolve(undefined, false).fellBackFrom, undefined);
  const explicit = catalog.resolve('vanished', false);
  assert.equal(explicit.info.id, 'zsh');
  assert.equal(explicit.fellBackFrom, 'vanished');
  assert.equal(catalog.resolve('fish', false).fellBackFrom, undefined);
  assert.equal(catalog.resolve('fish', false).info.id, 'fish');
});

test('catalog: the user default applies to requests without an explicit shell', () => {
  const { catalog } = makeCatalog({ shellId: 'fish' });
  assert.equal(catalog.resolve(undefined, false).info.id, 'fish');
  assert.equal(catalog.resolve('bash', false).info.id, 'bash');
});

test('catalog: login flag and user arguments are appended as separate argv entries', () => {
  const { catalog } = makeCatalog({ shellArgs: { bash: '--norc --noprofile', zsh: '"broken' } });
  assert.deepEqual(catalog.resolve('bash', true).args, ['-l', '--norc', '--noprofile']);
  assert.deepEqual(catalog.resolve('bash', false).args, ['--norc', '--noprofile']);
  assert.deepEqual(catalog.resolve('zsh', true).args, ['-l'], 'unparsable arguments are ignored, not half-applied');
  assert.ok(catalog.scan().problems.some((p) => p.id === 'zsh'));
});

test('catalog: shells with the same name get unique ids', () => {
  const d = unixDeps({ '/usr/bin/bash': '/usr/bin/bash', '/opt/homebrew/bin/bash': '/opt/hb/bash' }, { readFile: (p) => (p === '/etc/shells' ? '/usr/bin/bash\n/opt/homebrew/bin/bash\n' : null) });
  const catalog = new shellsMod.ShellCatalog(() => settings.defaultSettings('linux'), d);
  const ids = catalog.scan().shells.map((s) => s.id);
  assert.deepEqual(ids.sort(), ['bash', 'bash-2']);
});

test('catalog: with no shells at all, resolve still returns a system fallback or null', () => {
  const catalog = new shellsMod.ShellCatalog(() => settings.defaultSettings('linux'), unixDeps({}));
  const r = catalog.resolve(undefined, false);
  assert.ok(r === null || r.info.id === 'fallback');
});

test('fonts: Nerd Font families are picked out of fc-list output, Mono variants and the symbols font first', () => {
  const fc = [
    'Noto Sans',
    'MesloLGS Nerd Font,MesloLGS NF',
    'MesloLGM Nerd Font Mono',
    'Inter Display,Inter Display Thin',
    'Symbols Nerd Font Mono',
    'MesloLGM Nerd Font Mono',
    'JetBrainsMono Nerd Font',
    'Bad<Name> Nerd Font'
  ].join('\n');
  assert.deepEqual(fonts.parseNerdFontFamilies(fc), ['Symbols Nerd Font Mono', 'MesloLGM Nerd Font Mono', 'JetBrainsMono Nerd Font', 'MesloLGS Nerd Font']);
  assert.deepEqual(fonts.parseNerdFontFamilies('Noto Sans\nInter'), []);
  assert.equal(fonts.parseNerdFontFamilies(Array.from({ length: 30 }, (_, i) => `Font${i} Nerd Font Mono`).join('\n')).length, 8);
});

console.log(`\n${passed} unit tests passed${process.exitCode ? ' (with failures)' : ''}`);
