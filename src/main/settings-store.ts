import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applySettingsPatch, defaultSettings, sanitizeSettings } from '../shared/settings';
import type { Platform, Settings } from '../shared/types';

/** Persists settings as JSON in the user-data directory (atomic writes, debounced). */
export class SettingsStore {
  private readonly file: string;
  private readonly defaults: Settings;
  private current: Settings;
  private timer: NodeJS.Timeout | null = null;
  private listeners = new Set<(s: Settings) => void>();

  constructor(userDataDir: string, platform: Platform) {
    this.file = join(userDataDir, 'settings.json');
    this.defaults = defaultSettings(platform);
    this.current = this.load();
  }

  get(): Settings {
    return this.current;
  }

  set(patch: unknown): Settings {
    const next = applySettingsPatch(this.current, patch);
    if (JSON.stringify(next) !== JSON.stringify(this.current)) {
      this.current = next;
      this.scheduleWrite();
      for (const l of this.listeners) l(next);
    }
    return this.current;
  }

  reset(): Settings {
    this.current = { ...this.defaults, keybindings: {} };
    this.scheduleWrite();
    for (const l of this.listeners) l(this.current);
    return this.current;
  }

  onChange(cb: (s: Settings) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.current, null, 2), 'utf8');
      renameSync(tmp, this.file);
    } catch (err) {
      console.error('[settings] failed to write', err);
    }
  }

  private scheduleWrite(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  private load(): Settings {
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
      return sanitizeSettings(raw, this.defaults);
    } catch {
      return { ...this.defaults, keybindings: {} };
    }
  }
}
