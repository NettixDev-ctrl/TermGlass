import { useEffect } from 'react';
import { api } from '../api';
import { appStore, showShellPicker, uiStore } from '../state/app';
import { ChevronUpIcon } from './Icons';
import { paneMetaStore, workspaceStore } from '../state/workspace';
import { useStore } from '../hooks/useStore';
import { registry } from '../terminal/registry';

function shortPath(path: string | null, home: string): string {
  if (!path) return '';
  if (home && path === home) return '~';
  if (home && path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
  return path;
}

/** Keeps the active pane's working directory fresh (the main process reads it from /proc on Linux). */
function useCwdPolling(paneId: string | null, enabled: boolean): void {
  useEffect(() => {
    if (!paneId || !enabled) return;
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const info = await api().pty.info(paneId);
        if (!stop && info.cwd) {
          paneMetaStore.set((m) => (m[paneId] && m[paneId]!.cwd !== info.cwd ? { ...m, [paneId]: { ...m[paneId]!, cwd: info.cwd } } : m));
        }
      } catch {
        /* pane may be gone */
      }
    };
    void tick();
    const t = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [paneId, enabled]);
}

export function StatusBar() {
  const home = useStore(appStore, (s) => s.info.homedir);
  const paneId = useStore(workspaceStore, (s) => s.tabs.find((t) => t.id === s.activeTabId)?.activePane ?? null);
  const meta = useStore(paneMetaStore, (m) => (paneId ? m[paneId] : undefined));
  const live = registry.get(paneId);
  const shellPickerOpen = useStore(uiStore, (u) => u.shellPicker !== null);
  useCwdPolling(paneId, true);

  return (
    <footer className="statusbar">
      <div className="status-left">
        {meta?.shell && (
          <button
            className="status-chip"
            title="Switch shell"
            aria-haspopup="dialog"
            aria-expanded={shellPickerOpen}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              showShellPicker('switch', { left: r.left - 4, top: r.top, bottom: r.bottom }, 'above');
            }}
          >
            {meta.shell}
            <ChevronUpIcon />
          </button>
        )}
        {meta?.cwd && <span className="status-item status-path" title={meta.cwd}>{shortPath(meta.cwd, home)}</span>}
        {meta?.exited && <span className="status-item status-warn">exited</span>}
      </div>
      <div className="status-right">
        {meta && meta.cols > 0 && <span className="status-item">{live?.cols ?? meta.cols}×{live?.rows ?? meta.rows}</span>}
        <span className="status-item">UTF-8</span>
      </div>
    </footer>
  );
}
