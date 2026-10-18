import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ShellInfo } from '@shared/types';
import { appStore, hideShellPicker, openSettings, uiStore } from '../state/app';
import { refreshShells, setDefaultShell } from '../state/shells';
import { focusActivePane, getActivePaneId, newTab, paneMetaStore, splitPane, switchPaneShell } from '../state/workspace';
import { useStore } from '../hooks/useStore';

type Action = 'switch' | 'tab' | 'split' | 'default';

export function ShellSelector() {
  const picker = useStore(uiStore, (u) => u.shellPicker);
  return picker ? <Popover picker={picker} /> : null;
}

function Popover({ picker }: { picker: NonNullable<ReturnType<typeof uiStore.get>['shellPicker']> }) {
  const shells = useStore(appStore, (s) => s.shellList.shells);
  const defaultId = useStore(appStore, (s) => s.settings.shellId);
  const activePane = getActivePaneId();
  const currentId = useStore(paneMetaStore, (m) => (activePane ? m[activePane]?.shellId : null) ?? null);
  const explicitDefault = defaultId !== 'auto' && shells.some((sh) => sh.id === defaultId) ? defaultId : null;

  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => Math.max(0, shells.findIndex((s) => s.id === currentId)));
  const [scanning, setScanning] = useState(false);
  const [left, setLeft] = useState(picker.left);

  const primary: Action = picker.mode === 'switch' ? 'switch' : 'tab';
  const secondary = useMemo<Action[]>(() => (['switch', 'tab', 'split', 'default'] as Action[]).filter((a) => a !== primary), [primary]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (el) setLeft(Math.max(8, Math.min(picker.left, window.innerWidth - el.offsetWidth - 8)));
    el?.focus();
  }, [picker.left]);

  const close = (refocus = true) => {
    hideShellPicker();
    if (refocus) focusActivePane();
  };

  const run = (shell: ShellInfo, action: Action, opts: { alt?: boolean } = {}) => {
    if (action === 'default') {
      setDefaultShell(shell.id === explicitDefault ? 'auto' : shell.id);
      return; // keep the popover open so the new marker is visible
    }
    close(false);
    if (action === 'switch') void switchPaneShell(undefined, shell.id);
    else if (action === 'tab') newTab({ shellId: shell.id });
    else splitPane(opts.alt ? 'col' : 'row', undefined, shell.id);
    focusActivePane();
  };

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement instanceof HTMLInputElement) return;
      const shell = shells[index];
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        if (shells.length) setIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + shells.length) % shells.length);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        setIndex(e.key === 'Home' ? 0 : Math.max(0, shells.length - 1));
      } else if (e.key === 'Enter' && shell) {
        e.preventDefault();
        e.stopPropagation();
        // Enter: primary action. Shift+Enter: the other "new" action. Alt+Enter: split (Alt+Shift: split down).
        if (e.altKey) run(shell, 'split', { alt: e.shiftKey });
        else if (e.shiftKey) run(shell, primary === 'switch' ? 'tab' : 'switch');
        else run(shell, primary);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', () => close(false));
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [index, shells, primary, explicitDefault]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const rescan = async () => {
    setScanning(true);
    try {
      await refreshShells();
    } finally {
      setScanning(false);
    }
  };

  const style: React.CSSProperties = { left, ...(picker.placement === 'above' ? { bottom: picker.edge + 6 } : { top: picker.edge + 6 }) };
  const label: Record<Action, string> = { switch: 'Switch', tab: 'New tab', split: 'Split', default: 'Default' };
  const titles: Record<Action, string> = {
    switch: 'Replace the shell in the active pane',
    tab: 'Open a new tab with this shell',
    split: 'Split right (hold Alt to split down)',
    default: 'Use this shell for new sessions'
  };

  return (
    <div className={`shellpop glass ${picker.placement}`} style={style} ref={rootRef} tabIndex={-1} role="dialog" aria-label="Shells">
      <div className="shellpop-head">
        <span className="shellpop-title">{picker.mode === 'switch' ? 'Shell in this pane' : 'New tab with'}</span>
        <button className="shellpop-link" onClick={() => void rescan()} disabled={scanning} title="Scan the system for installed shells">
          {scanning ? 'Scanning…' : 'Rescan'}
        </button>
      </div>
      <div className="shellpop-list" role="listbox" ref={listRef}>
        {shells.length === 0 && <div className="shellpop-empty">No shells were found on this system.</div>}
        {shells.map((shell, i) => {
          const isCurrent = shell.id === currentId;
          const isNewDefault = shell.id === explicitDefault;
          return (
            <div
              key={shell.id}
              role="option"
              aria-selected={isCurrent}
              data-active={i === index}
              className={`shell-item${i === index ? ' active' : ''}${isCurrent ? ' current' : ''}`}
              onPointerMove={() => i !== index && setIndex(i)}
              onClick={() => run(shell, primary)}
            >
              <span className="shell-text">
                <span className="shell-name">
                  {shell.name}
                  {isCurrent && <span className="tag tag-current">current</span>}
                  {shell.isDefault && <span className="tag" title="System default shell">system</span>}
                  {isNewDefault && <span className="tag tag-accent">default</span>}
                  {shell.kind === 'custom' && <span className="tag">custom</span>}
                </span>
                <span className="shell-path" title={[shell.path, ...shell.args].join(' ')}>
                  {shell.path}
                  {shell.args.length > 0 && <span className="shell-args"> {shell.args.join(' ')}</span>}
                </span>
              </span>
              <span className="shell-actions">
                {secondary.map((a) => (
                  <button
                    key={a}
                    className={`shell-act${a === 'default' && isNewDefault ? ' on' : ''}`}
                    title={titles[a]}
                    onClick={(e) => {
                      e.stopPropagation();
                      run(shell, a, { alt: e.altKey });
                    }}
                  >
                    {label[a]}
                  </button>
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <div className="shellpop-foot">
        <button
          className="shellpop-link"
          onClick={() => {
            close(false);
            openSettings('shell');
          }}
        >
          Shell settings
        </button>
      </div>
    </div>
  );
}
