import { useEffect, useMemo, useRef, useState } from 'react';
import { togglePalette, uiStore } from '../state/app';
import { buildPaletteEntries, type PaletteEntry } from '../state/commands';
import { fuzzyMatch } from '../state/fuzzy';
import { useStore } from '../hooks/useStore';

export function CommandPalette() {
  const open = useStore(uiStore, (u) => u.palette);
  return open ? <PaletteInner /> : null;
}

interface Scored {
  entry: PaletteEntry;
  indices: number[];
  score: number;
}

function PaletteInner() {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const entries = useMemo(() => buildPaletteEntries(), []);

  const results = useMemo<Scored[]>(() => {
    if (!query.trim()) return entries.map((entry) => ({ entry, indices: [], score: 0 }));
    const out: Scored[] = [];
    for (const entry of entries) {
      const m = fuzzyMatch(query, entry.title);
      const cat = m ? null : fuzzyMatch(query, `${entry.category} ${entry.title}`);
      if (m) out.push({ entry, indices: m.indices, score: m.score });
      else if (cat) out.push({ entry, indices: [], score: cat.score - 20 });
    }
    return out.sort((a, b) => b.score - a.score);
  }, [entries, query]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index, results]);

  const run = (s: Scored | undefined) => {
    if (!s) return;
    togglePalette(false);
    // Run after the palette has unmounted so commands that open other UI take focus cleanly.
    queueMicrotask(() => s.entry.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setIndex((i) => Math.min(results.length - 1, i + 8));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 8));
    } else if (e.key === 'Home' && e.ctrlKey) {
      setIndex(0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      togglePalette(false);
    }
  };

  return (
    <div className="scrim top" onPointerDown={() => togglePalette(false)}>
      <div className="palette glass" role="dialog" aria-label="Command palette" onPointerDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          placeholder="Type a command…"
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={results[index] ? `pal-${results[index]!.entry.id}` : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <div className="palette-empty">No matching commands</div>}
          {results.map((r, i) => (
            <div
              key={r.entry.id}
              id={`pal-${r.entry.id}`}
              role="option"
              aria-selected={i === index}
              data-selected={i === index}
              className={`palette-item${i === index ? ' selected' : ''}`}
              onPointerMove={() => i !== index && setIndex(i)}
              onClick={() => run(r)}
            >
              <span className="palette-cat">{r.entry.category}</span>
              <span className="palette-title">
                <Highlighted text={r.entry.title} indices={r.indices} />
              </span>
              {r.entry.keys && <kbd>{r.entry.keys}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Highlighted({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const set = new Set(indices);
  const parts: React.ReactNode[] = [];
  let buf = '';
  let hit = false;
  const flush = (key: number) => {
    if (buf) parts.push(hit ? <mark key={key}>{buf}</mark> : buf);
    buf = '';
  };
  [...text].forEach((ch, i) => {
    const isHit = set.has(i);
    if (isHit !== hit) {
      flush(i);
      hit = isHit;
    }
    buf += ch;
  });
  flush(text.length);
  return <>{parts}</>;
}
