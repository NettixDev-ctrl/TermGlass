import { useEffect, useRef, useState } from 'react';
import { uiStore } from '../state/app';
import { registry } from '../terminal/registry';
import type { SearchState } from '../terminal/TerminalSession';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from './Icons';

export function FindBar({ paneId }: { paneId: string }) {
  const session = registry.get(paneId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(() => (session?.term.getSelection() ?? '').split('\n')[0]?.slice(0, 200) ?? '');
  const [caseSensitive, setCase] = useState(false);
  const [regex, setRegex] = useState(false);
  const [wholeWord, setWhole] = useState(false);
  const [result, setResult] = useState<SearchState | null>(null);
  const opts = { caseSensitive, regex, wholeWord };

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    if (!session) return;
    const off = session.onSearchResults(setResult);
    return () => {
      off();
      session.clearSearch();
    };
  }, [session]);

  // Re-run the incremental search when the query or an option changes.
  useEffect(() => {
    session?.find(query, opts, 'next', true);
  }, [query, caseSensitive, regex, wholeWord]);

  const close = () => {
    uiStore.set((u) => ({ ...u, find: null }));
    session?.focus();
  };
  const step = (dir: 'next' | 'prev') => session?.find(query, opts, dir);

  const label = !query ? '' : result && result.count > 0 ? (result.index >= 0 ? `${result.index + 1} of ${result.count}` : `${result.count}+`) : 'No results';

  return (
    <div className="findbar" role="search" onPointerDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={query}
        placeholder="Find"
        spellCheck={false}
        aria-label="Find in terminal"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            step(e.shiftKey ? 'prev' : 'next');
          } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        }}
      />
      <span className={`find-count${label === 'No results' ? ' none' : ''}`}>{label}</span>
      <button className={`find-toggle${caseSensitive ? ' on' : ''}`} onClick={() => setCase(!caseSensitive)} title="Match case" aria-pressed={caseSensitive}>Aa</button>
      <button className={`find-toggle${wholeWord ? ' on' : ''}`} onClick={() => setWhole(!wholeWord)} title="Whole word" aria-pressed={wholeWord}>W</button>
      <button className={`find-toggle${regex ? ' on' : ''}`} onClick={() => setRegex(!regex)} title="Regular expression" aria-pressed={regex}>.*</button>
      <button className="icon-btn small" onClick={() => step('prev')} title="Previous match (Shift+Enter)" aria-label="Previous match"><ChevronUpIcon /></button>
      <button className="icon-btn small" onClick={() => step('next')} title="Next match (Enter)" aria-label="Next match"><ChevronDownIcon /></button>
      <button className="icon-btn small" onClick={close} title="Close (Esc)" aria-label="Close find"><CloseIcon /></button>
    </div>
  );
}
