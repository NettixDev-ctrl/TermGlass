import { useMemo } from 'react';
import { appStore, openSettings } from '../state/app';
import { closeTab, focusActivePane, newTab, paneMetaStore, selectTab, tabTitle, workspaceStore, type Tab } from '../state/workspace';
import { useStore } from '../hooks/useStore';
import { CloseIcon, GearIcon, PlusIcon } from './Icons';

function shortPath(path: string | null, home: string): string {
  if (!path) return '';
  if (home && path === home) return '~';
  if (home && path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
  return path;
}

export function Sidebar() {
  const open = useStore(appStore, (s) => s.settings.sidebarOpen);
  const tabs = useStore(workspaceStore, (s) => s.tabs);
  const activeId = useStore(workspaceStore, (s) => s.activeTabId);

  return (
    <aside className="sidebar" data-open={open} aria-hidden={!open} inert={!open}>
      <div className="sidebar-inner">
        <div className="sidebar-head">
          <span>Sessions</span>
          <button className="icon-btn small" onClick={() => newTab()} aria-label="New tab" title="New Tab">
            <PlusIcon />
          </button>
        </div>
        <nav className="session-list">
          {tabs.map((tab) => (
            <SessionRow key={tab.id} tab={tab} active={tab.id === activeId} />
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="sidebar-link" onClick={() => openSettings()}>
            <GearIcon />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function SessionRow({ tab, active }: { tab: Tab; active: boolean }) {
  const title = useStore(paneMetaStore, (m) => tabTitle(tab, m));
  const meta = useStore(paneMetaStore, (m) => m[tab.activePane]);
  const home = useStore(appStore, (s) => s.info.homedir);
  const panes = useMemo(() => {
    const walk = (n: Tab['root']): number => (n.kind === 'leaf' ? 1 : walk(n.a) + walk(n.b));
    return walk(tab.root);
  }, [tab.root]);
  const sub = [meta?.shell, shortPath(meta?.cwd ?? null, home), panes > 1 ? `${panes} panes` : ''].filter(Boolean).join(' · ');

  return (
    <div className={`session-row${active ? ' active' : ''}`} onClick={() => { selectTab(tab.id); focusActivePane(); }} role="button" tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectTab(tab.id);
          focusActivePane();
        }
      }}>
      <div className="session-text">
        <div className="session-title">{title}</div>
        {sub && <div className="session-sub">{sub}</div>}
      </div>
      <button
        className="tab-close"
        aria-label="Close tab"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          void closeTab(tab.id);
        }}
      >
        <CloseIcon size={10} />
      </button>
    </div>
  );
}
