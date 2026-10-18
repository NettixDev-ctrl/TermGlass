// Regenerates docs/screenshots/*.png from the built app using real commands in real shells.
// Requires `npm run build`, a display, and vim. Usage: node scripts/screenshots.mjs
import { _electron as electron } from 'playwright-core';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'screenshots');
mkdirSync(out, { recursive: true });

const home = mkdtempSync(join(tmpdir(), 'termglass-shots-home-'));
const userData = mkdtempSync(join(tmpdir(), 'termglass-shots-ud-'));
writeFileSync(
  join(home, '.bashrc'),
  [
    "PS1='\\[\\e[38;2;106;164;255m\\]~/termglass\\[\\e[0m\\] \\[\\e[2m\\]on\\[\\e[0m\\] \\[\\e[38;2;138;217;163m\\]main\\[\\e[0m\\] \\$ '",
    "alias ls='ls --color=always'",
    "PROMPT_COMMAND=''",
    'export LC_ALL=C.UTF-8',
    ''
  ].join('\n')
);
writeFileSync(join(home, '.bash_profile'), '');
// Stage a copy of the sources in the temp home so screenshots show a neutral path (~/termglass).
for (const dir of ['src', 'scripts']) cpSync(join(root, dir), join(home, 'termglass', dir), { recursive: true });

const app = await electron.launch({
  args: ['.'],
  cwd: root,
  env: { ...process.env, HOME: home, SHELL: '/usr/bin/bash', TERMGLASS_E2E: '1', TERMGLASS_USER_DATA: userData }
});
const page = await app.firstWindow();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = async (cmd) => {
  await page.keyboard.type(cmd, { delay: 2 });
  await page.keyboard.press('Enter');
  await sleep(450);
};
const rename = async (name) => {
  await page.keyboard.press('Control+Shift+R');
  await page.waitForSelector('.tab-rename');
  await page.keyboard.press('Control+a');
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await sleep(150);
};

await page.waitForSelector('.tab');
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1240, 780));
await sleep(1200);

await run('cd ~/termglass');
await run('clear');
await rename('termglass');
await page.keyboard.press('Control+Shift+T');
await sleep(500);
await rename('server');
await page.keyboard.press('Control+Shift+T');
await sleep(500);
await rename('notes');
await page.keyboard.press('Alt+1');
await sleep(400);

await page.keyboard.press('Control+Shift+D');
await sleep(700);
await page.keyboard.press('Control+Shift+E');
await sleep(700);

// Bottom right: a real coloured diff.
await run("diff -u --color=always <(printf 'fn main() {\\n    run();\\n}\\n') <(printf 'fn main() {\\n    run_all();\\n    exit(0);\\n}\\n')");

// Top right: colour ramps and a directory listing.
await page.keyboard.press('Alt+Shift+ArrowUp');
await sleep(200);
await run('clear');
await run("for i in {0..15}; do printf '\\e[48;5;%dm   \\e[0m' $i; done; echo");
await run("awk 'BEGIN{for(i=0;i<72;i++){r=255-i*255/71;g=i*510/71;b=i*255/71;if(g>255)g=510-g;printf \"\\033[48;2;%d;%d;%dm \\033[0m\",r,g,b}print \"\"}'");
await run('ls --color=always src scripts src/renderer');

// Left: vim with syntax highlighting on the app's own source.
await page.keyboard.press('Alt+Shift+ArrowLeft');
await sleep(200);
await run("vim -u NONE -N -c 'syntax on' -c 'filetype on' -c 'set number' -c 'set background=dark' src/main/pty-manager.ts");
await sleep(1000);
await page.keyboard.press('Control+f');
await sleep(500);
await page.mouse.move(5, 5);
await sleep(600);
await page.screenshot({ path: join(out, 'splits-dark.png') });

await page.keyboard.press('Control+Shift+P');
await page.waitForSelector('.palette');
await page.keyboard.type('theme');
await sleep(500);
await page.screenshot({ path: join(out, 'command-palette.png') });
await page.keyboard.press('Escape');

await page.keyboard.press('Control+Shift+S');
await page.waitForSelector('.shellpop');
await sleep(400);
await page.locator('.shell-item').nth(1).hover();
await sleep(300);
await page.screenshot({ path: join(out, 'shell-selector.png') });
await page.keyboard.press('Escape');
await sleep(300);

await page.keyboard.press('Control+,');
await page.waitForSelector('.settings');
await sleep(500);
await page.screenshot({ path: join(out, 'settings-appearance.png') });
await page.getByRole('button', { name: 'Shells', exact: true }).click();
await sleep(500);
await page.screenshot({ path: join(out, 'settings-shells.png') });
await page.getByRole('button', { name: 'Appearance', exact: true }).click();
await sleep(300);
await page.getByRole('radio', { name: 'Frost' }).click();
await sleep(500);
await page.keyboard.press('Escape');
await sleep(600);
await page.keyboard.press('Control+Shift+B');
await sleep(700);
await page.screenshot({ path: join(out, 'frost-sidebar.png') });

await app.close();
console.log('Screenshots written to', out);
