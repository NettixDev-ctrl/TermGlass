import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

const PROD_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

const DEV_CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* http://localhost:*",
  "base-uri 'none'"
].join('; ');

/** Injects a strict Content-Security-Policy; the dev server gets a relaxed one for HMR. */
function csp(): Plugin {
  return {
    name: 'termglass-csp',
    transformIndexHtml(html, ctx) {
      const policy = ctx.server ? DEV_CSP : PROD_CSP;
      return html.replace('__CSP__', policy);
    }
  };
}

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  base: './',
  plugins: [react(), csp()],
  resolve: {
    alias: { '@shared': resolve(root, 'src/shared') }
  },
  server: { port: 5173, strictPort: true, host: 'localhost' },
  build: {
    outDir: resolve(root, 'dist/renderer'),
    emptyOutDir: true,
    target: 'chrome140',
    sourcemap: false,
    chunkSizeWarningLimit: 1500
  }
});
