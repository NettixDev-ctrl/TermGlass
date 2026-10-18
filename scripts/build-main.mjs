// Bundles the Electron main process and the sandboxed preload script with esbuild.
import { build, context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions[]} */
const targets = [
  {
    entryPoints: [resolve(root, 'src/main/index.ts')],
    outfile: resolve(root, 'dist/main/index.js'),
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'node-pty'],
    alias: { '@shared': resolve(root, 'src/shared') }
  },
  {
    // The renderer is sandboxed, so the preload must be one self-contained CommonJS file.
    entryPoints: [resolve(root, 'src/preload/index.ts')],
    outfile: resolve(root, 'dist/preload/index.js'),
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    alias: { '@shared': resolve(root, 'src/shared') }
  }
];

const common = { bundle: true, sourcemap: false, logLevel: 'info', legalComments: 'none' };

if (watch) {
  const ctxs = await Promise.all(targets.map((t) => context({ ...common, ...t })));
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log('[build-main] watching…');
} else {
  await Promise.all(targets.map((t) => build({ ...common, ...t, minify: false })));
}
