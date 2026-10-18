import { appStore, openSettings } from '../state/app';
import { updateSettings } from '../state/settings';
import { useStore } from '../hooks/useStore';
import { focusActivePane } from '../state/workspace';
import { GearIcon, SidebarIcon } from './Icons';
import { TabBar } from './TabBar';
import { WindowControls } from './WindowControls';

export function TitleBar() {
  const platform = useStore(appStore, (s) => s.info.platform);
  const sidebarOpen = useStore(appStore, (s) => s.settings.sidebarOpen);
  const fullscreen = useStore(appStore, (s) => s.window.fullscreen);

  return (
    <header className={`titlebar${platform === 'darwin' && !fullscreen ? ' mac-inset' : ''}`}>
      <button
        className={`icon-btn${sidebarOpen ? ' on' : ''}`}
        onClick={() => { updateSettings({ sidebarOpen: !sidebarOpen }); focusActivePane(); }}
        aria-label="Toggle sidebar"
        aria-pressed={sidebarOpen}
        title="Toggle Sidebar"
      >
        <SidebarIcon />
      </button>
      <TabBar />
      <div className="titlebar-spacer" />
      <button className="icon-btn" onClick={() => openSettings()} aria-label="Settings" title="Settings">
        <GearIcon />
      </button>
      {platform === 'linux' && <WindowControls />}
      {platform === 'win32' && <div className="win-overlay-gap" />}
    </header>
  );
}
