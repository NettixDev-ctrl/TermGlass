import type { TermGlassApi } from '@shared/types';

/** The typed bridge exposed by the preload script. */
export function api(): TermGlassApi {
  const a = window.termglass;
  if (!a) throw new Error('TermGlass preload API is not available (the renderer must run inside Electron).');
  return a;
}
