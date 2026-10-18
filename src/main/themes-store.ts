import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs';
import { basename, join } from 'node:path';
import { BUILTIN_THEMES, parseCustomTheme, slugify } from '../shared/themes';
import type { Theme, ThemeListResult, ThemeLoadError } from '../shared/types';

const EXAMPLE = {
  id: 'midnight-ink',
  name: 'Midnight Ink',
  type: 'dark',
  ui: { accent: '#b69cff' },
  terminal: {
    background: '#0d0f1a',
    foreground: '#dfe3f5',
    cursor: '#b69cff',
    selectionBackground: 'rgba(182, 156, 255, 0.28)',
    red: '#ff7a93',
    green: '#9be3b0',
    yellow: '#f4d58d',
    blue: '#7ea6ff',
    magenta: '#c9a0ff',
    cyan: '#7fdcec'
  }
};

/** Loads custom theme JSON files from <userData>/themes and watches the directory for changes. */
export class ThemesStore {
  readonly dir: string;
  private result: ThemeListResult;
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private listeners = new Set<(r: ThemeListResult) => void>();

  constructor(userDataDir: string) {
    this.dir = join(userDataDir, 'themes');
    try {
      mkdirSync(this.dir, { recursive: true });
      const example = join(this.dir, 'midnight-ink.json.example');
      if (!existsSync(example) && readdirSync(this.dir).length === 0) writeFileSync(example, JSON.stringify(EXAMPLE, null, 2), 'utf8');
    } catch {
      /* the directory is optional */
    }
    this.result = this.scan();
    try {
      this.watcher = watch(this.dir, () => this.scheduleRescan());
      this.watcher.on('error', () => undefined);
    } catch {
      /* watching is best-effort */
    }
  }

  list(): ThemeListResult {
    return this.result;
  }

  find(id: string): Theme | undefined {
    return BUILTIN_THEMES.find((t) => t.id === id) ?? this.result.themes.find((t) => t.id === id);
  }

  onChange(cb: (r: ThemeListResult) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  dispose(): void {
    this.watcher?.close();
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleRescan(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.result = this.scan();
      for (const l of this.listeners) l(this.result);
    }, 200);
  }

  private scan(): ThemeListResult {
    const themes: Theme[] = [];
    const errors: ThemeLoadError[] = [];
    let files: string[] = [];
    try {
      files = readdirSync(this.dir).filter((f) => f.toLowerCase().endsWith('.json')).sort();
    } catch {
      /* missing dir */
    }
    for (const file of files) {
      const full = join(this.dir, file);
      try {
        if (statSync(full).size > 256 * 1024) throw new Error('File is larger than 256 KB.');
        const raw = JSON.parse(readFileSync(full, 'utf8')) as unknown;
        const theme = parseCustomTheme(raw, slugify(basename(file, '.json')) || 'custom');
        if (themes.some((t) => t.id === theme.id)) throw new Error(`Duplicate theme id "${theme.id}".`);
        themes.push(theme);
      } catch (err) {
        errors.push({ file, message: err instanceof Error ? err.message : String(err) });
      }
    }
    return { themes, errors, dir: this.dir };
  }
}
