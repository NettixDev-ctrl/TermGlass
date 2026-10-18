import { luminance, mix, parseColor, toHex } from '@shared/color';
import { api } from '../api';
import { appStore, resolveTheme } from '../state/app';
import { buildTerminalConfig, effectiveAccent, type TerminalConfig } from '../terminal/config';
import { registry } from '../terminal/registry';

let lastSig = '';
let lastConfigSig = '';

/** Current terminal configuration derived from settings and the active theme. */
export function currentTerminalConfig(): TerminalConfig {
  const state = appStore.get();
  return buildTerminalConfig(state.settings, resolveTheme(state), state.info.nerdFonts);
}

/** Writes theme/appearance settings to CSS custom properties on <html> and pushes terminal options to xterm. */
export function applyAppearance(): void {
  const state = appStore.get();
  const { settings, info, window: win } = state;
  const theme = resolveTheme(state);
  const root = document.documentElement;

  const accent = effectiveAccent(settings, theme);
  const translucent = info.translucent && (info.platform !== 'win32' || settings.windowBlur);
  const alpha = translucent ? settings.windowOpacity : 1;
  const rounded = info.roundedWindow && !win.maximized && !win.fullscreen;

  const sig = JSON.stringify([theme, accent, alpha, settings.glassBlur, settings.animations, info.platform, rounded, win.focused]);
  if (sig !== lastSig) {
    lastSig = sig;
    const s = root.style;
    s.setProperty('--bg', theme.ui.background);
    s.setProperty('--surface', theme.ui.surface);
    s.setProperty('--fg', theme.ui.foreground);
    s.setProperty('--muted', theme.ui.muted);
    s.setProperty('--border', theme.ui.border);
    s.setProperty('--accent', accent);
    s.setProperty('--on-accent', luminance(accent) > 0.4 ? '#101114' : '#ffffff');
    s.setProperty('--win-alpha', String(alpha));
    s.setProperty('--glass-blur', `${settings.glassBlur}px`);
    s.setProperty('--panel-solid', mix(theme.ui.background, theme.ui.surface, 0.85));
    s.colorScheme = theme.type;
    root.dataset.themeType = theme.type;
    root.dataset.motion = settings.animations;
    root.dataset.platform = info.platform;
    root.dataset.rounded = rounded ? '1' : '0';
    root.dataset.focused = win.focused ? '1' : '0';
    root.dataset.translucent = alpha < 1 ? '1' : '0';

    if (info.platform === 'win32') api().window.setTitleBarTheme({ background: '#000000', symbol: toHex(parseColor(theme.ui.foreground) ?? [255, 255, 255, 1]) });
  }

  const config = buildTerminalConfig(settings, theme, info.nerdFonts);
  const configSig = JSON.stringify(config);
  if (configSig !== lastConfigSig) {
    lastConfigSig = configSig;
    registry.setConfig(config);
  }
}

export function initAppearance(): () => void {
  applyAppearance();
  return appStore.subscribe(applyAppearance);
}
