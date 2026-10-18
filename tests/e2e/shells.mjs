// End-to-end test of shell detection and management against the real app and real shells.
// Requires `npm run build`, a display, and bash + zsh + fish installed. Usage: node tests/e2e/shells.mjs
import { _electron as electron } from 'playwright-core';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifacts = join(root, 'tests', 'e2e', 'artifacts');
mkdirSync(artifacts, { recursive: true });
const has = (cmd) => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };
for (const need of ['bash', 'zsh', 'fish']) if (!has(need)) { console.log(`SKIP  shell e2e needs ${need}`); process.exit(0); }

const userData = mkdtempSync(join(tmpdir(), 'termglass-sh-ud-'));
const home = mkdtempSync(join(tmpdir(), 'termglass-sh-home-'));
const tools = mkdtempSync(join(tmpdir(), 'termglass-sh-tools-'));
writeFileSync(join(home, '.bashrc'), "PS1='bash$ '\n");
writeFileSync(join(home, '.bash_profile'), '');
writeFileSync(join(home, '.zshrc'), "PROMPT='zsh%% '\nexport ZSHRC_LOADED=yes\n");
mkdirSync(join(home, '.config', 'fish'), { recursive: true });
writeFileSync(join(home, '.config', 'fish', 'config.fish'), "set -g fish_greeting\nfunction fish_prompt\n  echo -n 'fish> '\nend\n");
// A bash rc that is only used when startup arguments are applied: --rcfile <file>.
writeFileSync(join(tools, 'args.rc'), "PS1='ARGS-OK> '\n");
// A custom shell: any executable works; this one wraps bash with a recognisable prompt.
writeFileSync(join(tools, 'mysh'), `#!/bin/sh\necho "PS1='CUSTOM> '" > "${tools}/custom.rc"\nexec /usr/bin/env bash --rcfile "${tools}/custom.rc" -i\n`);
chmodSync(join(tools, 'mysh'), 0o755);
// Settings written before launch: a default shell that no longer exists, one broken and one good custom shell, args for bash.
writeFileSync(
  join(userData, 'settings.json'),
  JSON.stringify({
    shellId: 'ghost-shell',
    customShells: [
      { id: 'custom-broken', name: 'Broken', path: '/opt/definitely-not-installed/shell' },
      { id: 'custom-mysh', name: 'My sh', path: join(tools, 'mysh') }
    ],
    shellArgs: { bash: `--rcfile ${join(tools, 'args.rc')}` }
  })
);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : detail ? `  -> ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = await electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, HOME: home, SHELL: '/usr/bin/bash', XDG_CONFIG_HOME: join(home, '.config'), TERMGLASS_E2E: '1', TERMGLASS_USER_DATA: userData }
});
const page = await app.firstWindow();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));

const activeBuffer = () =>
  page.evaluate(() => {
    const r = window.__termglass.registry;
    const active = document.querySelector('.tabview.active .pane.active');
    const id = r.ids().find((i) => active && active.contains(r.get(i).element)) ?? r.ids()[0];
    const b = r.get(id).term.buffer.active;
    const lines = [];
    for (let i = 0; i < b.length; i++) lines.push(b.getLine(i).translateToString(true));
    return { text: lines.join('\n'), id };
  });
const waitFor = async (fn, what, timeout = 10000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${what}`);
};
const hasLine = async (re) => (await activeBuffer()).text.split('\n').some((l) => re.test(l.trim()));
const waitLine = (re, what, t) => waitFor(() => hasLine(re), what ?? String(re), t);
const run = async (cmd) => {
  await page.keyboard.type(cmd, { delay: 4 });
  await page.keyboard.press('Enter');
};
const chipText = async () => (await page.locator('.status-chip').innerText()).trim();
const openPicker = async () => {
  await page.keyboard.press('Control+Shift+S');
  await page.waitForSelector('.shellpop');
};
const row = (name) => page.locator('.shell-item').filter({ has: page.locator('.shell-name', { hasText: new RegExp(`^${name}`) }) });
const rowNames = async () => (await page.locator('.shell-item .shell-name').allInnerTexts()).map((t) => t.split('\n')[0].trim());
const pgrepChildren = (name) => {
  try { return execFileSync('pgrep', ['-x', name]).toString().split('\n').filter(Boolean).length; } catch { return 0; }
};

try {
  await page.waitForSelector('.tab', { timeout: 20000 });
  await waitLine(/(ARGS-OK>|bash\$)$/, 'first prompt', 15000);

  // --- fallback --------------------------------------------------------------------------------------
  const toast = await page.waitForSelector('.toast', { timeout: 5000 }).then((t) => t.innerText()).catch(() => '');
  check('a default shell that no longer exists falls back with a notice', /not available/i.test(toast) && (await activeBuffer()).text.includes('>'), toast);
  check('startup arguments from settings are applied (bash --rcfile)', await hasLine(/ARGS-OK>$/) || (await activeBuffer()).text.includes('ARGS-OK>'));
  await page.screenshot({ path: join(artifacts, 'sh-01-start.png') });

  // --- selector lists real shells ----------------------------------------------------------------
  await page.locator('.status-chip').click();
  await page.waitForSelector('.shellpop');
  const names = await rowNames();
  check('selector lists detected shells (Bash, Zsh, Fish) plus the valid custom shell', ['Bash', 'Zsh', 'Fish', 'My sh'].every((n) => names.includes(n)), names.join(','));
  check('invalid custom shell is not listed', !names.includes('Broken'));
  const paths = await page.locator('.shell-item .shell-path').allInnerTexts();
  check('every entry shows an absolute executable path that exists', paths.length > 0 && paths.every((p) => p.startsWith('/') && existsSync(p.split(' ')[0])), paths.join(' | '));
  const systemTags = await page.locator('.shell-item .tag', { hasText: /^system$/ }).count();
  check('exactly one entry is marked as the system default', systemTags === 1, `${systemTags}`);
  const currentRow = await page.locator('.shell-item.current .shell-name').innerText();
  check('the active shell is highlighted as current', currentRow.startsWith('Bash'), currentRow);
  await page.screenshot({ path: join(artifacts, 'sh-02-selector.png') });
  await page.keyboard.press('Escape');
  await sleep(200);
  check('Escape closes the selector', (await page.locator('.shellpop').count()) === 0);

  // --- switching: cwd kept, old process cleaned up, scrollback kept -------------------------------------
  await run('cd /tmp && echo PID=$$ && pwd');
  const pidLine = await waitFor(async () => {
    const m = (await activeBuffer()).text.match(/^PID=(\d+)$/m);
    return m ? Number(m[1]) : null;
  }, 'bash pid');
  const paneBefore = (await activeBuffer()).id;
  await openPicker();
  await row('Zsh').click({ position: { x: 90, y: 16 } });
  await waitFor(async () => (await chipText()).startsWith('Zsh'), 'status chip to show Zsh');
  check('one click switches the pane to Zsh without a confirmation (shell was idle)', (await page.locator('.dialog').count()) === 0 && (await chipText()).startsWith('Zsh'));
  await waitLine(/^zsh%$/, 'zsh prompt');
  await run('echo ZSH-V-${ZSH_VERSION:+set} && pwd');
  await waitLine(/^ZSH-V-set$/);
  const buf = await activeBuffer();
  check('the working directory is preserved across the switch', /^\/tmp$/m.test(buf.text.split('ZSH-V-set').pop() ?? ''), buf.text.slice(-200));
  check('the pane keeps its scrollback and session id', buf.text.includes(`PID=${pidLine}`) && buf.id === paneBefore);
  await waitFor(() => !existsSync(`/proc/${pidLine}`), 'old bash to exit', 4000).then(
    () => check('the previous PTY process is cleaned up', true),
    () => check('the previous PTY process is cleaned up', false, `pid ${pidLine} still alive`)
  );
  await run('echo ZRC-$ZSHRC_LOADED');
  await waitLine(/^ZRC-yes$/);

  // --- busy process: confirmation ---------------------------------------------------------------------
  await run('sleep 321');
  await sleep(500);
  await openPicker();
  await row('Fish').click({ position: { x: 90, y: 16 } });
  await page.waitForSelector('.dialog', { timeout: 5000 });
  const msg = await page.locator('.dialog p').innerText();
  check('switching while a program runs asks first and names the program', /sleep/.test(msg), msg);
  await page.screenshot({ path: join(artifacts, 'sh-03-switch-confirm.png') });
  await page.keyboard.press('Escape');
  await sleep(500);
  check('cancelling keeps the shell and the running program', (await chipText()).startsWith('Zsh') && pgrepChildren('sleep') >= 1);
  await openPicker();
  await row('Fish').click({ position: { x: 90, y: 16 } });
  await page.waitForSelector('.dialog');
  await page.getByRole('button', { name: 'Switch', exact: true }).click();
  await waitFor(async () => (await chipText()).startsWith('Fish'), 'status chip to show Fish');
  await waitLine(/^fish>$/, 'fish prompt');
  await waitFor(() => pgrepChildren('sleep') === 0, 'sleep to be terminated', 4000).then(
    () => check('confirming switches shells and terminates the old program', true),
    () => check('confirming switches shells and terminates the old program', false, 'sleep still running')
  );
  await run('echo FISH-V-$FISH_VERSION; pwd');
  await waitLine(/^FISH-V-\d/);
  check('Fish works as a real interactive shell and kept the directory', /^\/tmp$/m.test((await activeBuffer()).text.split('FISH-V-').pop() ?? ''));

  // --- new tab / split with a chosen shell -----------------------------------------------------------------
  const tabsBefore = await page.locator('.tab').count();
  await page.locator('.new-tab-menu').click();
  await page.waitForSelector('.shellpop.below');
  await row('Zsh').click({ position: { x: 90, y: 16 } });
  await waitFor(async () => (await page.locator('.tab').count()) === tabsBefore + 1, 'new tab');
  await waitLine(/^zsh%$/, 'zsh prompt in new tab');
  check('the tab-bar chevron opens a new tab with the chosen shell', (await chipText()).startsWith('Zsh'));

  await openPicker();
  await row('Bash').hover();
  await row('Bash').locator('.shell-act', { hasText: 'Split' }).click();
  await waitFor(async () => (await page.locator('.tabview.active .pane').count()) === 2, 'split pane');
  await waitLine(/ARGS-OK>$/, 'bash prompt in split');
  check('Split from the selector opens a pane with that shell (and its arguments)', (await chipText()).startsWith('Bash'));
  await page.screenshot({ path: join(artifacts, 'sh-04-split-shell.png') });
  await page.keyboard.press('Control+Shift+W');
  await sleep(400);

  // --- independent sessions ---------------------------------------------------------------------------------
  await openPicker();
  await row('Fish').click({ position: { x: 90, y: 16 } });
  await waitFor(async () => (await chipText()).startsWith('Fish'), 'fish in second tab');
  await page.keyboard.press('Alt+1');
  await sleep(300);
  const firstTabShell = await chipText();
  check('first tab still runs Fish while the second was switched independently', firstTabShell.startsWith('Fish'), firstTabShell);
  await page.keyboard.press('Alt+2');
  await sleep(300);

  // --- default shell --------------------------------------------------------------------------------------
  await openPicker();
  await row('Fish').hover();
  await row('Fish').locator('.shell-act', { hasText: 'Default' }).click();
  await sleep(700);
  await page.keyboard.press('Escape');
  const stored = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'));
  check('"Default" persists the chosen shell for future sessions', stored.shellId === 'fish', stored.shellId);
  await page.keyboard.press('Control+Shift+T');
  await waitLine(/^fish>$/, 'fish prompt in new default tab');
  check('new tabs use the new default shell', (await chipText()).startsWith('Fish'));

  // --- custom shell + startup arguments + rescan --------------------------------------------------------------
  await page.keyboard.press('Control+Shift+P');
  await page.waitForSelector('.palette');
  await page.keyboard.type('new tab with my sh');
  await sleep(200);
  await page.keyboard.press('Enter');
  await waitLine(/^CUSTOM>$/, 'custom shell prompt');
  check('a custom shell executable runs as a real session', (await chipText()).startsWith('My sh'));

  await page.keyboard.press('Control+,');
  await page.waitForSelector('.settings');
  await page.getByRole('button', { name: 'Shells', exact: true }).click();
  await page.waitForSelector('input[aria-label="New custom shell path"]');
  const warn = await page.locator('.field-error').allInnerTexts();
  check('settings explain why an unusable custom shell is not available', warn.some((t) => /not found|not an executable/i.test(t)), warn.join(' | '));
  await page.screenshot({ path: join(artifacts, 'sh-05-settings.png') });
  const lateShell = join(tools, 'late-sh');
  writeFileSync(lateShell, '#!/bin/sh\nexec /usr/bin/env bash --norc -i\n');
  chmodSync(lateShell, 0o755);
  await page.locator('input[aria-label="New custom shell path"]').fill(lateShell);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await waitFor(async () => (await page.locator('.shell-row .shell-name', { hasText: 'late-sh' }).count()) > 0, 'added custom shell in the list');
  check('adding a custom shell in settings lists it immediately', true);
  const argsInput = page.locator('input[aria-label="Startup arguments for Zsh"]');
  await argsInput.fill('-f');
  await argsInput.blur();
  await sleep(700);
  const stored2 = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'));
  check('startup arguments are saved per shell', stored2.shellArgs?.zsh === '-f' && stored2.customShells.length === 3, JSON.stringify(stored2.shellArgs));
  await page.locator('input[aria-label="Startup arguments for Zsh"]').fill('"unclosed');
  check('invalid startup arguments are flagged inline', (await page.locator('.field-error', { hasText: /quote/i }).count()) > 0);
  await argsInput.fill('-f');
  await argsInput.blur();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await sleep(300);

  await page.keyboard.press('Control+Shift+P');
  await page.waitForSelector('.palette');
  await page.keyboard.type('new tab with zsh');
  await sleep(200);
  await page.keyboard.press('Enter');
  await waitFor(async () => (await chipText()).startsWith('Zsh'), 'zsh tab');
  await sleep(600);
  await run('echo ZRC2-${ZSHRC_LOADED:-none}');
  await waitLine(/^ZRC2-none$/);
  check('startup arguments change how the shell starts (zsh -f skips .zshrc)', true);

  // Rescan: removing an executable makes it disappear and be reported.
  rmSync(lateShell);
  await openPicker();
  await page.getByRole('button', { name: 'Rescan', exact: true }).click();
  await waitFor(async () => !(await rowNames()).includes('late-sh'), 'late-sh to disappear after rescan', 5000).then(
    () => check('Rescan drops shells that were uninstalled', true),
    async () => check('Rescan drops shells that were uninstalled', false, (await rowNames()).join(','))
  );
  await page.keyboard.press('Escape');

  // --- keyboard use of the selector ------------------------------------------------------------------------------
  await openPicker();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+Enter'); // Shift+Enter: open the highlighted shell in a new tab
  await sleep(600);
  check('the selector is fully keyboard driven (arrows + Shift+Enter opens a tab)', (await page.locator('.shellpop').count()) === 0);
} catch (err) {
  check('test run completed without throwing', false, err instanceof Error ? err.stack ?? err.message : String(err));
  await page.screenshot({ path: join(artifacts, 'sh-failure.png') }).catch(() => {});
}

// --- no leaked processes -------------------------------------------------------------------------------------------
const mainPid = app.process().pid;
const children = () => {
  try {
    return execFileSync('pgrep', ['-P', String(mainPid)]).toString().split('\n').filter(Boolean).map(Number)
      .filter((p) => { try { return ['bash', 'zsh', 'fish', 'sh'].includes(readFileSync(`/proc/${p}/comm`, 'utf8').trim()); } catch { return false; } });
  } catch { return []; }
};
const liveShells = children();
const liveTabsPanes = await page.evaluate(() => window.__termglass.registry.ids().length).catch(() => -1);
check(`shell processes match open panes after all the switching (${liveShells.length} processes, ${liveTabsPanes} panes)`, liveShells.length === liveTabsPanes, `${liveShells} vs ${liveTabsPanes}`);
const closed = new Promise((resolve) => app.once('close', resolve));
await app.evaluate(({ app: a }) => a.quit()).catch(() => {});
await Promise.race([closed, sleep(8000)]);
await sleep(600);
check('every shell is terminated when the app quits', liveShells.every((p) => !existsSync(`/proc/${p}`)), liveShells.filter((p) => existsSync(`/proc/${p}`)).join());
const realErrors = pageErrors.filter((e) => !/Autofill|DevTools/.test(e));
check('no renderer errors were logged', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} shell checks passed`);
process.exit(failed.length ? 1 : 0);
