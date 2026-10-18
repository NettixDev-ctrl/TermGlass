import type { TermGlassApi } from '@shared/types';

declare global {
  interface Window {
    /** Exposed by the preload script. Undefined when the renderer is opened outside Electron. */
    termglass?: TermGlassApi;
  }
}

export {};
