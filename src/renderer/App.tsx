import { appStore } from './state/app';
import { useShortcuts } from './hooks/useShortcuts';
import { useStore } from './hooks/useStore';
import { CommandPalette } from './components/CommandPalette';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ContextMenu } from './components/ContextMenu';
import { SettingsDialog } from './components/SettingsDialog';
import { ShellSelector } from './components/ShellSelector';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';
import { Toast } from './components/Toast';
import { Workspace } from './components/Workspace';

export function App() {
  useShortcuts();
  const showStatus = useStore(appStore, (s) => s.settings.showStatusBar);
  return (
    <div className="window">
      <TitleBar />
      <div className="body">
        <Sidebar />
        <Workspace />
      </div>
      {showStatus && <StatusBar />}
      <CommandPalette />
      <SettingsDialog />
      <ConfirmDialog />
      <ContextMenu />
      <ShellSelector />
      <Toast />
    </div>
  );
}
