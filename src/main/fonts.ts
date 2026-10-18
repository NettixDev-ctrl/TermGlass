import { execFileSync } from 'node:child_process';

/**
 * Extracts Nerd Font family names from `fc-list : family` output. Monospaced ("Mono") variants come first because
 * their symbols are single-cell wide, which is what a terminal grid needs. Pure, so it is unit-tested.
 */
export function parseNerdFontFamilies(fcOutput: string, limit = 8): string[] {
  const families = new Set<string>();
  for (const line of fcOutput.split('\n')) {
    // A line may list several names for one face ("Name,Name Regular"); the first is the family.
    const family = line.split(',')[0]?.trim();
    if (family && /nerd font/i.test(family) && /^[\w .+-]{1,64}$/.test(family)) families.add(family);
  }
  const mono = (f: string) => / Mono$/i.test(f) || /Symbols Nerd Font Mono/i.test(f);
  const sorted = [...families].sort((a, b) => Number(mono(b)) - Number(mono(a)) || a.localeCompare(b));
  // The dedicated symbols-only font covers every glyph, so it is the best fallback when installed.
  const symbols = sorted.filter((f) => /^Symbols Nerd Font/i.test(f));
  return [...symbols, ...sorted.filter((f) => !symbols.includes(f))].slice(0, limit);
}

/** Installed Nerd Fonts (Linux/macOS via fontconfig). Used only as glyph fallbacks for prompt icons. */
export function detectNerdFontFamilies(): string[] {
  if (process.platform === 'win32') return [];
  try {
    const out = execFileSync('fc-list', [':', 'family'], { timeout: 4000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 << 20 });
    return parseNerdFontFamilies(out);
  } catch {
    return []; // fontconfig is not installed
  }
}
