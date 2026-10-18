import type { ITheme } from '@xterm/xterm';
import { mix, toHex, parseColor, withAlpha } from '@shared/color';
import type { Settings, Theme } from '@shared/types';

export interface TerminalConfig {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: 'block' | 'underline' | 'bar';
  cursorBlink: boolean;
  scrollback: number;
  theme: ITheme;
  minimumContrastRatio: number;
  gpu: boolean;
  copyOnSelect: boolean;
  search: { match: string; active: string; ruler: string };
}

const FALLBACK_FONTS = '"JetBrains Mono", "JetBrainsMono Nerd Font", "Cascadia Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

/**
 * The user's family (or list) first, then the bundled font, then any installed Nerd Fonts (so private-use icons from
 * prompts such as Starship have glyphs), then generic fallbacks.
 */
export function fontStack(user: string, nerdFonts: string[] = []): string {
  const cleaned = user.trim();
  const nerd = nerdFonts.map((f) => `"${f.replace(/"/g, '')}"`).join(', ');
  const tail = nerd ? `"JetBrains Mono", ${nerd}, ${FALLBACK_FONTS}` : FALLBACK_FONTS;
  if (!cleaned) return tail;
  const quoted = cleaned.includes(',') || /^["']/.test(cleaned) ? cleaned : `"${cleaned}"`;
  return `${quoted}, ${tail}`;
}

export function effectiveAccent(settings: Settings, theme: Theme): string {
  return settings.accent ?? theme.ui.accent;
}

export function buildTerminalConfig(settings: Settings, theme: Theme, nerdFonts: string[] = []): TerminalConfig {
  const t = theme.terminal;
  const accent = effectiveAccent(settings, theme);
  const accentHex = toHex(parseColor(accent) ?? [106, 164, 255, 1]);
  const xtermTheme: ITheme = {
    // The pane background is painted by CSS so that window translucency works, so xterm's own background is fully
    // transparent. It keeps the theme's RGB so minimumContrastRatio is computed against the real background colour.
    background: `${toHex(parseColor(t.background) ?? [0, 0, 0, 1])}00`,
    foreground: t.foreground,
    cursor: t.cursor,
    cursorAccent: t.cursorAccent,
    selectionBackground: settings.accent ? withAlpha(accent, 0.3) : t.selectionBackground,
    selectionInactiveBackground: withAlpha(t.foreground, 0.14),
    black: t.black,
    red: t.red,
    green: t.green,
    yellow: t.yellow,
    blue: t.blue,
    magenta: t.magenta,
    cyan: t.cyan,
    white: t.white,
    brightBlack: t.brightBlack,
    brightRed: t.brightRed,
    brightGreen: t.brightGreen,
    brightYellow: t.brightYellow,
    brightBlue: t.brightBlue,
    brightMagenta: t.brightMagenta,
    brightCyan: t.brightCyan,
    brightWhite: t.brightWhite,
    scrollbarSliderBackground: withAlpha(t.foreground, 0.16),
    scrollbarSliderHoverBackground: withAlpha(t.foreground, 0.28),
    scrollbarSliderActiveBackground: withAlpha(t.foreground, 0.38)
  };
  return {
    fontFamily: fontStack(settings.fontFamily, nerdFonts),
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    cursorStyle: settings.cursorShape,
    cursorBlink: settings.cursorBlink,
    scrollback: settings.scrollback,
    theme: xtermTheme,
    minimumContrastRatio: theme.minimumContrastRatio,
    gpu: settings.gpuRendering,
    copyOnSelect: settings.copyOnSelect,
    search: {
      match: mix(t.background, accentHex, 0.35),
      active: mix(t.background, accentHex, 0.7),
      ruler: accentHex
    }
  };
}
