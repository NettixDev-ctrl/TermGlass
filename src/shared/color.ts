// Small colour helpers shared by the main process, the renderer and the contrast check script.
export type RGBA = [number, number, number, number];

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

export function parseColor(input: string): RGBA | null {
  const s = input.trim();
  if (HEX.test(s)) {
    let h = s.slice(1);
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const m = FUNC.exec(s);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]);
    if ([r, g, b, a].some((v) => !Number.isFinite(v)) || r > 255 || g > 255 || b > 255 || a < 0 || a > 1) return null;
    return [r, g, b, a];
  }
  return null;
}

export function isValidColor(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && parseColor(value) !== null;
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

export function toHex([r, g, b]: RGBA): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a) ?? [0, 0, 0, 1];
  const cb = parseColor(b) ?? [0, 0, 0, 1];
  return toHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t, 1]);
}

export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color) ?? [0, 0, 0, 1];
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

export function luminance(color: string): number {
  const c = parseColor(color) ?? [0, 0, 0, 1];
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** WCAG contrast ratio between two colours (alpha is ignored). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
