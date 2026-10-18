// Development runner: Vite dev server (renderer) + esbuild watch (main/preload) + Electron with auto-restart.
import { createServer } from 'vite';
import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electronBin = require('electron');

const server = await createServer({ configFile: resolve(root, 'vite.config.mts') });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173/';

let child = null;
let restarting = false;
let timer = null;

function launch() {
  child = spawn(electronBin, ['.', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, TERMGLASS_DEV_URL: url }
  });
  child.on('exit', (code) => {
    child = null;
    if (!restarting) {
      server.close().finally(() => process.exit(code ?? 0));
    }
  });
}

function restart() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!child) return launch();
    restarting = true;
    child.once('exit', () => {
      restarting = false;
      launch();
    });
    child.kill('SIGTERM');
  }, 150);
}

const rebuildPlugin = {
  name: 'restart-electron',
  setup(build) {
    let first = true;
    build.onEnd(() => {
      if (first) {
        first = false;
        return;
      }
      restart();
    });
  }
};

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'info',
  alias: { '@shared': resolve(root, 'src/shared') },
  plugins: [rebuildPlugin]
};

const ctxs = await Promise.all([
  context({ ...common, entryPoints: [resolve(root, 'src/main/index.ts')], outfile: resolve(root, 'dist/main/index.js'), external: ['electron', 'node-pty'] }),
  context({ ...common, entryPoints: [resolve(root, 'src/preload/index.ts')], outfile: resolve(root, 'dist/preload/index.js'), external: ['electron'] })
]);
await Promise.all(ctxs.map((c) => c.rebuild()));
await Promise.all(ctxs.map((c) => c.watch()));

launch();
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    child?.kill('SIGTERM');
    server.close().finally(() => process.exit(0));
  });
}
