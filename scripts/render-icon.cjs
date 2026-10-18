// Renders build/icon.svg to build/icon.png (512x512) using Electron itself.
// Usage: npx electron scripts/render-icon.cjs
const { app, BrowserWindow } = require('electron');
const { writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = readFileSync(join(__dirname, '..', 'build', 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage();
  writeFileSync(join(__dirname, '..', 'build', 'icon.png'), image.resize({ width: 512, height: 512 }).toPNG());
  app.quit();
});
