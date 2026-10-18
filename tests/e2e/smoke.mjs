// End-to-end smoke test: launches the built app in Electron, drives it through real keyboard input and
// verifies behaviour against the real PTY. Requires `npm run build` first and a display (X11 or Wayland).
import { _electron as electron } from 'playwright-core';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifacts = join(root, 'tests', 'e2e', 'artifacts');
mkdirSync(artifacts, { recursive: true });

const userData = mkdtempSync(join(tmpdir(), 'termglass-ud-'));
const home = mkdtempSync(join(tmpdir(), 'termglass-home-'));
// A deterministic, minimal shell environment so user rc files can't interfere.
writeFileSync(join(home, '.bashrc'), "PS1='$ '\nexport LC_ALL=C.UTF-8\n");
writeFileSync(join(home, '.bash_profile'), '');
writeFileSync(join(home, '.zshrc'), "PROMPT='%% '\n"); // an existing .zshrc skips zsh's first-run wizard

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : detail ? `  -> ${detail}` : ''}`);
};

const app = await electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, HOME: home, SHELL: '/usr/bin/bash', TERMGLASS_E2E: '1', TERMGLASS_USER_DATA: userData }
});
const page = await app.firstWindow();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bufferText = (index = -1) =>
  page.evaluate((index) => {
    const r = window.__termglass.registry;
    const ids = r.ids();
    const id = ids[index < 0 ? ids.length - 1 : index];
    const s = r.get(id);
    const b = s.term.buffer.active;
    const lines = [];
    for (let i = 0; i < b.length; i++) lines.push(b.getLine(i).translateToString(true));
    return lines.join('\n');
  }, index);
const activeBuffer = () =>
  page.evaluate(() => {
    const r = window.__termglass.registry;
    const active = [...document.querySelectorAll('.tabview.active .pane.active')][0];
    const ids = r.ids();
    // The active pane is the one whose element is inside the active pane section.
    const id = ids.find((i) => active && active.contains(r.get(i).element)) ?? ids[0];
    const s = r.get(id);
    const b = s.term.buffer.active;
    const lines = [];
    for (let i = 0; i < b.length; i++) lines.push(b.getLine(i).translateToString(true));
    return { text: lines.join('\n'), id, type: b.type, cols: s.cols, rows: s.rows };
  });
const waitFor = async (fn, what, timeout = 8000) => {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(60);
  }
  throw new Error(`Timed out waiting for ${what}`);
};
const waitText = (needle, timeout) => waitFor(async () => (await activeBuffer()).text.includes(needle), `text "${needle}"`, timeout);
const type = async (text) => {
  await page.keyboard.type(text, { delay: 4 });
};
const run = async (cmd) => {
  await type(cmd);
  await page.keyboard.press('Enter');
};

try {
  await page.waitForSelector('.tab', { timeout: 20000 });
  await waitFor(async () => (await activeBuffer()).text.includes('$'), 'shell prompt', 15000);
  check('app starts and a real shell prompt appears', true);
  await page.screenshot({ path: join(artifacts, '01-start.png') });

  // --- basic I/O through the real PTY --------------------------------------------------
  await run('echo hello-$((6*7))');
  await waitText('hello-42');
  check('typed command executes in a real shell (arithmetic expansion)', true);

  await run("printf '\\033[38;2;255;100;0mTRUECOLOR\\033[0m\\n'");
  const findTruecolor = () =>
    page.evaluate(() => {
      const r = window.__termglass.registry;
      for (const id of r.ids()) {
        const b = r.get(id).term.buffer.active;
        for (let y = 0; y < b.length; y++) {
          const line = b.getLine(y);
          const str = line.translateToString(true);
          // The output line is exactly the marker; the echoed command line also contains it.
          if (str.trim() === 'TRUECOLOR') {
            const c = line.getCell(str.indexOf('TRUECOLOR'));
            return { rgb: c.isFgRGB(), color: c.getFgColor() };
          }
        }
      }
      return null;
    });
  const truecolor = await waitFor(findTruecolor, 'truecolor output');
  check('truecolor escape sequences are honoured', truecolor?.rgb === true && truecolor.color === 0xff6400, JSON.stringify(truecolor));

  // Prompt icons (Starship, Powerlevel10k) live in the private-use area and need a Nerd Font to draw.
  const nerd = await page.evaluate(async () => {
    const info = await window.termglass.app.getInfo();
    if (info.nerdFonts.length === 0) return { skipped: true };
    const r = window.__termglass.registry;
    const stack = r.get(r.ids()[0]).term.options.fontFamily;
    const draw = (font) => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      x.font = `40px ${font}`;
      x.fillText('\ue718', 8, 48);
      return c.toDataURL();
    };
    return { skipped: false, stackHasNerd: info.nerdFonts.every((f) => stack.includes(f)), differs: draw(stack) !== draw('"JetBrains Mono", monospace') };
  });
  if (nerd.skipped) console.log('SKIP  Nerd Font fallback test (no Nerd Font installed)');
  else check('installed Nerd Fonts are in the font stack and draw private-use prompt icons', nerd.stackHasNerd && nerd.differs, JSON.stringify(nerd));

  await run("echo 'héllo wörld 日本語 🙂'");
  await waitText('héllo wörld 日本語 🙂');
  check('UTF-8 / unicode output (accents, CJK, emoji)', true);

  await run('echo $TERM $COLORTERM $TERM_PROGRAM');
  await waitText('xterm-256color truecolor TermGlass');
  check('TERM, COLORTERM and TERM_PROGRAM are set for the shell', true);

  // --- signals ---------------------------------------------------------------------------
  await run('sleep 60');
  await sleep(300);
  await page.keyboard.press('Control+c');
  await run('echo after-sigint');
  await waitText('after-sigint');
  check('Ctrl+C interrupts a running foreground process', true);

  await run('cat');
  await sleep(200);
  await type('line-through-cat');
  await page.keyboard.press('Enter');
  await waitFor(async () => ((await activeBuffer()).text.match(/line-through-cat/g) ?? []).length >= 2, 'cat echo');
  await page.keyboard.press('Control+d');
  await run('echo after-eof');
  await waitText('after-eof');
  check('Ctrl+D sends EOF (cat exits, shell survives)', true);

  await run('sleep 60');
  await sleep(300);
  await page.keyboard.press('Control+z');
  await waitText('Stopped');
  await run('kill %1; echo after-stop');
  await waitText('after-stop');
  check('Ctrl+Z suspends the foreground job (job control works)', true);

  // --- full-screen applications -------------------------------------------------------
  const hasVim = (() => { try { execFileSync('which', ['vim']); return true; } catch { return false; } })();
  const hasLess = (() => { try { execFileSync('which', ['less']); return true; } catch { return false; } })();
  const pager = hasVim ? 'vim -u NONE -N' : hasLess ? 'less /etc/passwd' : null;
  if (pager) {
    await run(pager);
    await waitFor(async () => (await activeBuffer()).type === 'alternate', 'alternate screen', 6000);
    check(`${pager.split(' ')[0]} switches to the alternate screen`, true);
    await page.screenshot({ path: join(artifacts, '02-fullscreen-app.png') });
    if (hasVim) {
      await type('ihello-from-vim');
      await page.keyboard.press('Escape');
      await type(':q!');
      await page.keyboard.press('Enter');
    } else {
      await type('q');
    }
    await waitFor(async () => (await activeBuffer()).type === 'normal', 'return to normal screen', 6000);
    check('full-screen app exits and the normal screen is restored', true);
  } else {
    console.log('SKIP  full-screen app test (no vim/less)');
  }

  // More full-screen programs: nano and htop (mouse + alternate screen), exited with their own quit keys.
  for (const [cmd, quitKey] of [['nano', 'Control+x'], ['htop', 'q']]) {
    const exists = (() => { try { execFileSync('which', [cmd]); return true; } catch { return false; } })();
    if (!exists) {
      console.log(`SKIP  ${cmd} test (not installed)`);
      continue;
    }
    await run(cmd);
    await waitFor(async () => (await activeBuffer()).type === 'alternate', `${cmd} alternate screen`, 8000);
    await sleep(700);
    if (cmd === 'htop') await page.screenshot({ path: join(artifacts, '02b-htop.png') });
    await page.keyboard.press(quitKey);
    await waitFor(async () => (await activeBuffer()).type === 'normal', `${cmd} to exit`, 8000);
    check(`${cmd} runs full-screen and exits cleanly`, true);
  }

  // --- resizing ----------------------------------------------------------------------------
  const before = await activeBuffer();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 560));
  // Wait until the terminal size has settled.
  let settled = before;
  for (let stable = 0, last = ''; stable < 6; await sleep(100)) {
    settled = await activeBuffer();
    const key = `${settled.cols}x${settled.rows}`;
    stable = key === last ? stable + 1 : 0;
    last = key;
  }
  check('window resize refits the terminal', settled.cols !== before.cols && settled.rows !== before.rows, `${before.cols}x${before.rows} -> ${settled.cols}x${settled.rows}`);
  await run('clear; stty size');
  await waitText(`${settled.rows} ${settled.cols}`);
  const tail = (await activeBuffer()).text;
  check('new size is propagated to the PTY (stty size matches)', new RegExp(`^${settled.rows} ${settled.cols}$`, 'm').test(tail), tail.slice(0, 120));

  // --- tabs --------------------------------------------------------------------------------
  const pidOf = async () => {
    await run('echo PID=$$');
    const end = Date.now() + 6000;
    while (Date.now() < end) {
      const t = (await activeBuffer()).text;
      const m = [...t.matchAll(/^PID=(\d+)$/gm)];
      if (m.length) return Number(m[m.length - 1][1]);
      await sleep(60);
    }
    throw new Error('no PID');
  };
  const pid1 = await pidOf();
  await page.keyboard.press('Control+Shift+T');
  await waitFor(async () => (await page.locator('.tab').count()) === 2, 'second tab');
  await waitFor(async () => (await activeBuffer()).text.includes('$'), 'second shell prompt');
  const pid2 = await pidOf();
  check('Ctrl+Shift+T opens a second tab with an independent shell', (await page.locator('.tab').count()) === 2 && pid1 !== pid2, `${pid1} vs ${pid2}`);
  await page.screenshot({ path: join(artifacts, '03-two-tabs.png') });

  // --- splits ------------------------------------------------------------------------------
  await page.keyboard.press('Control+Shift+D');
  await waitFor(async () => (await page.locator('.tabview.active .pane').count()) === 2, 'split pane');
  await waitFor(async () => (await activeBuffer()).text.includes('$'), 'split shell prompt');
  const pid3 = await pidOf();
  await page.keyboard.press('Control+Shift+E');
  await waitFor(async () => (await page.locator('.tabview.active .pane').count()) === 3, 'second split');
  await waitFor(async () => (await activeBuffer()).text.includes('$'), 'second split prompt');
  const pid4 = await pidOf();
  check('horizontal and vertical splits each get their own PTY process', new Set([pid2, pid3, pid4]).size === 3, `${pid2} ${pid3} ${pid4}`);
  await sleep(500);
  await page.screenshot({ path: join(artifacts, '04-splits.png') });

  // Directional focus: the active pane is the bottom-right one; move left.
  const activeIdx = () => page.evaluate(() => [...document.querySelectorAll('.tabview.active .pane')].findIndex((p) => p.classList.contains('active')));
  const idxBefore = await activeIdx();
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await sleep(150);
  const idxAfter = await activeIdx();
  check('Alt+Shift+Arrow moves focus between panes', idxBefore !== idxAfter, `${idxBefore} -> ${idxAfter}`);

  // Divider drag changes pane proportions.
  const widthsBefore = await page.evaluate(() => [...document.querySelectorAll('.tabview.active .pane')].map((p) => Math.round(p.getBoundingClientRect().width)));
  const div = page.locator('.tabview.active .divider-row').first();
  const box = await div.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 150, box.y + 40, { steps: 8 });
  await page.mouse.up();
  await sleep(300);
  const widthsAfter = await page.evaluate(() => [...document.querySelectorAll('.tabview.active .pane')].map((p) => Math.round(p.getBoundingClientRect().width)));
  check('dragging a split divider resizes panes', JSON.stringify(widthsBefore) !== JSON.stringify(widthsAfter), `${widthsBefore} -> ${widthsAfter}`);

  // --- command palette ---------------------------------------------------------------------
  await page.keyboard.press('Control+Shift+P');
  await page.waitForSelector('.palette');
  await type('oled');
  await sleep(150);
  const first = await page.locator('.palette-item.selected .palette-title').innerText();
  await page.screenshot({ path: join(artifacts, '05-palette.png') });
  await page.keyboard.press('Enter');
  await sleep(300);
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  check('command palette fuzzy-filters and applies the OLED Black theme', first.includes('OLED Black') && bg === '#000000', `${first} / ${bg}`);

  await page.keyboard.press('Control+Shift+P');
  await page.waitForSelector('.palette');
  await type('switch to tab');
  await sleep(150);
  const swItem = await page.locator('.palette-item.selected .palette-title').innerText();
  await page.keyboard.press('Escape');
  check('palette lists "Switch to Tab" entries and Esc closes it', swItem.startsWith('Switch to Tab') && (await page.locator('.palette').count()) === 0, swItem);

  // --- settings ----------------------------------------------------------------------------
  await page.keyboard.press('Control+,');
  await page.waitForSelector('.settings');
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await page.waitForSelector('input[aria-label="Scrollback lines"]');
  await page.screenshot({ path: join(artifacts, '06-settings-terminal.png') });
  await page.locator('input[aria-label="Scrollback lines"]').fill('4321');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.waitForSelector('.theme-grid');
  await page.screenshot({ path: join(artifacts, '07-settings-appearance.png') });
  await page.getByRole('radio', { name: 'Frost' }).click();
  await sleep(500);
  await page.keyboard.press('Escape');
  await sleep(800);
  const saved = existsSync(join(userData, 'settings.json')) ? JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8')) : null;
  check('settings are persisted to settings.json', saved?.scrollback === 4321 && saved?.themeId === 'frost', JSON.stringify(saved)?.slice(0, 200));
  await page.screenshot({ path: join(artifacts, '08-frost-theme.png') });

  // --- find in terminal -----------------------------------------------------------------------
  await page.keyboard.press('Control+Shift+F');
  await page.waitForSelector('.findbar input');
  await type('PID');
  await sleep(300);
  const count = await page.locator('.find-count').innerText();
  check('find bar searches terminal output', /of \d+/.test(count), count);
  await page.keyboard.press('Escape');

  // --- clipboard -----------------------------------------------------------------------------
  await run('echo clipboard-roundtrip-marker');
  await waitText('clipboard-roundtrip-marker');
  await page.keyboard.press('Control+Shift+A');
  await page.keyboard.press('Control+Shift+C');
  await sleep(300);
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
  check('select-all + copy puts terminal text on the clipboard', clip.includes('clipboard-roundtrip-marker'), clip.slice(0, 80));
  await app.evaluate(({ clipboard }) => clipboard.writeText('echo pasted-from-clipboard'));
  await page.keyboard.press('Control+Shift+V');
  await page.keyboard.press('Enter');
  await waitText('pasted-from-clipboard');
  check('paste sends clipboard text to the shell', true);

  // --- closing -------------------------------------------------------------------------------
  const tabsBefore = await page.locator('.tab').count();
  const panesBefore = await page.locator('.tabview.active .pane').count();
  await page.keyboard.press('Control+Shift+W');
  await sleep(500);
  check('Ctrl+Shift+W closes the active pane', (await page.locator('.tabview.active .pane').count()) === panesBefore - 1);
  await page.keyboard.press('Control+Shift+W');
  await sleep(500);
  await page.keyboard.press('Control+Shift+W');
  await sleep(700);
  check('closing the last pane of a tab closes the tab', (await page.locator('.tab').count()) === tabsBefore - 1, `${tabsBefore} -> ${await page.locator('.tab').count()}`);

  // Exiting the shell with Ctrl+D closes its tab; confirm the dialog appears for busy shells.
  await run('sleep 300');
  await sleep(400);
  await page.keyboard.press('Control+Alt+w');
  await page.waitForSelector('.dialog', { timeout: 5000 }).then(
    () => check('closing a tab with a running program asks for confirmation', true),
    () => check('closing a tab with a running program asks for confirmation', false, 'no dialog')
  );
  await page.screenshot({ path: join(artifacts, '09-confirm.png') });
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.keyboard.press('Control+c');

  // --- shell exit handling ----------------------------------------------------------------------
  await page.keyboard.press('Control+Shift+T');
  await waitFor(async () => (await activeBuffer()).text.trimEnd().endsWith('$'), 'prompt in new tab');
  await run('exit 3');
  await waitText('exited with code 3');
  check('a non-zero exit keeps the pane open and explains why', true);
  await page.keyboard.press('Enter');
  await waitFor(async () => {
    const t = (await activeBuffer()).text.trimEnd();
    return t.endsWith('$') && t.split('\n').filter((l) => l.trim() === '$').length >= 1 && t.includes('exited with code 3');
  }, 'restarted shell prompt');
  await run('echo restarted-ok');
  await waitFor(async () => (await activeBuffer()).text.split('\n').some((l) => l.trim() === 'restarted-ok'), 'restarted shell output');
  check('pressing Enter restarts the shell in the same pane', true);
  const tabsBeforeExit = await page.locator('.tab').count();
  await run('exit');
  await waitFor(async () => (await page.locator('.tab').count()) === tabsBeforeExit - 1, 'tab to close after exit');
  check('a clean exit (Ctrl+D / exit) closes the tab', true);
  await sleep(300);

  // --- heavy output and flow control ------------------------------------------------------------------
  let maxLatency = 0;
  let polling = true;
  const poll = (async () => {
    while (polling) {
      const t0 = Date.now();
      await page.evaluate(() => 1);
      maxLatency = Math.max(maxLatency, Date.now() - t0);
      await sleep(100);
    }
  })();
  const t0 = Date.now();
  await run('seq 1 1500000; echo big-done-$((1+1))');
  await waitFor(async () => (await activeBuffer()).text.split('\n').some((l) => l.trim() === 'big-done-2'), 'heavy output to finish', 90000);
  const elapsed = Date.now() - t0;
  polling = false;
  await poll;
  const lastNumbers = (await activeBuffer()).text;
  check(`1.5M lines of output are rendered intact in ${(elapsed / 1000).toFixed(1)}s (UI max stall ${maxLatency} ms)`, lastNumbers.includes('1499999') && maxLatency < 2000, `${maxLatency}ms`);
  const mem = await app.evaluate(async ({ app }) => (await app.getAppMetrics()).map((m) => ({ type: m.type, mb: Math.round(m.memory.workingSetSize / 1024) })));
  console.log('      memory (MB):', JSON.stringify(mem));
  await run('clear');

  // --- a second shell type selected through the palette -----------------------------------------------
  const hasZsh = (() => { try { execFileSync('which', ['zsh']); return true; } catch { return false; } })();
  if (hasZsh) {
    await page.keyboard.press('Control+Shift+P');
    await page.waitForSelector('.palette');
    await type('new tab with zsh');
    await sleep(150);
    await page.keyboard.press('Enter');
    await waitFor(async () => (await activeBuffer()).text.includes('%'), 'zsh prompt');
    await run('echo zsh-version-${ZSH_VERSION:+set}');
    await waitFor(async () => (await activeBuffer()).text.split('\n').some((l) => l.trim() === 'zsh-version-set'), 'zsh output');
    check('"New Tab with Zsh" from the palette starts a real zsh session', true);
    await run('exit');
    await sleep(500);
  } else {
    console.log('SKIP  zsh test (zsh not installed)');
  }

  // --- custom themes + shells list + context menu -----------------------------------------------------
  mkdirSync(join(userData, 'themes'), { recursive: true });
  writeFileSync(join(userData, 'themes', 'e2e-custom.json'), JSON.stringify({ id: 'e2e-custom', name: 'E2E Custom', type: 'dark', terminal: { background: '#102030', red: '#ff0000' } }));
  writeFileSync(join(userData, 'themes', 'broken.json'), '{ "type": "dark", "terminal": { "red": "not-a-colour" } }');
  await sleep(800);
  await page.keyboard.press('Control+Shift+P');
  await page.waitForSelector('.palette');
  await type('E2E Custom');
  await sleep(150);
  const customItem = await page.locator('.palette-item.selected .palette-title').innerText().catch(() => '');
  await page.keyboard.press('Enter');
  await sleep(400);
  const customBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  check('custom JSON themes are discovered live and can be applied', customItem.includes('E2E Custom') && customBg === '#102030', `${customItem} / ${customBg}`);

  await page.keyboard.press('Control+,');
  await page.waitForSelector('.settings');
  await page.getByRole('button', { name: 'Themes', exact: true }).click();
  await page.waitForSelector('.plain-list.err');
  const themeError = await page.locator('.plain-list.err').innerText();
  check('invalid theme files are reported instead of crashing', themeError.includes('broken.json') && /valid colou?r/.test(themeError), themeError);
  await page.getByRole('button', { name: 'Shells', exact: true }).click();
  await page.waitForSelector('select[aria-label="Default shell"]');
  const shellOptions = await page.locator('select[aria-label="Default shell"] option').allInnerTexts();
  check('detected shells are listed in settings', shellOptions.some((o) => o.startsWith('Bash')) && shellOptions.some((o) => /^System default/.test(o)), shellOptions.join(' | '));
  await page.keyboard.press('Escape');
  await sleep(200);

  await page.locator('.tabview.active .pane.active').click({ button: 'right', position: { x: 200, y: 120 } });
  await page.waitForSelector('.menu');
  const menuItems = await page.locator('.menu-item').allInnerTexts();
  check('right-click opens the pane context menu', ['Copy', 'Paste', 'Split Right', 'Split Down', 'Close Pane'].every((l) => menuItems.some((m) => m.startsWith(l))), menuItems.join(' | '));
  await page.screenshot({ path: join(artifacts, '13-context-menu.png') });
  await page.keyboard.press('Escape');
  await sleep(200);

  // --- sidebar ---------------------------------------------------------------------------------
  await page.keyboard.press('Control+Shift+B');
  await sleep(500);
  const sidebarWidth = await page.evaluate(() => document.querySelector('.sidebar').getBoundingClientRect().width);
  check('Ctrl+Shift+B opens the collapsible sidebar', sidebarWidth > 200, `${sidebarWidth}`);
  await page.screenshot({ path: join(artifacts, '10-sidebar.png') });
  await page.keyboard.press('Control+Shift+B');
  await sleep(400);

  // --- tab rename + reorder --------------------------------------------------------------------
  await page.keyboard.press('Control+Shift+T');
  await page.keyboard.press('Control+Shift+T');
  await waitFor(async () => (await page.locator('.tab').count()) >= 3, 'extra tabs');
  const activeTabIndex = () => page.evaluate(() => [...document.querySelectorAll('.tab')].findIndex((t) => t.classList.contains('active')));
  const idxA = await activeTabIndex();
  await page.keyboard.press('Control+PageUp');
  await sleep(150);
  const idxB = await activeTabIndex();
  await page.keyboard.press('Control+PageDown');
  await sleep(150);
  const idxC = await activeTabIndex();
  await page.keyboard.press('Alt+1');
  await sleep(150);
  const idxD = await activeTabIndex();
  await page.keyboard.press('Control+Shift+Tab');
  await sleep(150);
  check('Ctrl+PageUp/PageDown, Ctrl+Shift+Tab and Alt+1 navigate tabs', idxB !== idxA && idxC === idxA && idxD === 0, `${idxA} ${idxB} ${idxC} ${idxD}`);
  await page.keyboard.press('Alt+9');
  await sleep(150);
  await page.keyboard.press('Control+Shift+R');
  await page.waitForSelector('.tab-rename');
  await page.keyboard.press('Control+a');
  await type('build-box');
  await page.keyboard.press('Enter');
  await sleep(200);
  const titles = () => page.locator('.tab .tab-title').allInnerTexts();
  check('tabs can be renamed', (await titles()).includes('build-box'), (await titles()).join(','));
  const titlesBefore = await titles();
  const tabs = page.locator('.tab');
  const a = await tabs.nth(titlesBefore.indexOf('build-box')).boundingBox();
  const b = await tabs.nth(0).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await sleep(300);
  check('tabs can be reordered by dragging', (await titles())[0] === 'build-box', (await titles()).join(','));
  await page.screenshot({ path: join(artifacts, '11-tabs-reordered.png') });

  // --- quit with running shells: confirmation + process cleanup --------------------------------
  await run('sleep 300');
  await sleep(500);
  const mainPid = app.process().pid;
  const shellPidsAlive = () => {
    try {
      return execFileSync('pgrep', ['-P', String(mainPid)]).toString().split('\n').filter(Boolean).map(Number)
        .filter((p) => { try { return readFileSync(`/proc/${p}/comm`, 'utf8').trim() === 'bash'; } catch { return false; } });
    } catch { return []; }
  };
  const diag = await page.evaluate(() => ({ focus: document.activeElement?.className, hasFocus: document.hasFocus() })).catch(() => ({}));
  const busyNow = await waitFor(async () => (await page.evaluate(() => 1), execFileSync('pgrep', ['-x', 'sleep']).toString().trim()), 'sleep process', 4000).catch(() => null);
  if (!busyNow) console.log('      DIAG: sleep is not running before quit; focus =', JSON.stringify(diag), 'buffer tail =', JSON.stringify((await activeBuffer()).text.trimEnd().slice(-160)));
  const liveShells = shellPidsAlive();
  check(`several shells are running before quit (${liveShells.length})`, liveShells.length >= 3, `${liveShells}`);
  await page.locator('.wc-close').click();
  await page.waitForSelector('.dialog', { timeout: 5000 });
  check('quitting while a program runs asks for confirmation', (await page.locator('.dialog h2').innerText()).includes('Quit'));
  await page.screenshot({ path: join(artifacts, '12-quit-confirm.png') });
  const closed = new Promise((resolve) => app.once('close', resolve));
  // The app exits as a result of this click, which Playwright may report as a closed target.
  await page.getByRole('button', { name: 'Quit' }).click({ noWaitAfter: true }).catch(() => {});
  await Promise.race([closed, sleep(8000)]);
  await sleep(500);
  const leaked = liveShells.filter((p) => existsSync(`/proc/${p}`));
  check(`all ${liveShells.length} shell processes are terminated after quitting`, leaked.length === 0, `leaked: ${leaked}`);
} catch (err) {
  check('test run completed without throwing', false, err instanceof Error ? err.stack ?? err.message : String(err));
  console.log('      DIAG buffer:', JSON.stringify((await activeBuffer().catch(() => ({ text: '?' }))).text.trimEnd().slice(-300)));
  console.log('      DIAG focus:', JSON.stringify(await page.evaluate(() => ({ el: document.activeElement?.className, hasFocus: document.hasFocus(), vis: document.visibilityState })).catch(() => null)));
  await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => {});
}

await app.close().catch(() => {});

const realErrors = pageErrors.filter((e) => !/Autofill|DevTools/.test(e));
check('no renderer errors were logged', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
