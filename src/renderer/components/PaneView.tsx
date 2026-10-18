import { memo, useLayoutEffect, useRef } from 'react';
import { effectiveKeys, formatKeys, COMMANDS } from '@shared/keybindings';
import { appStore, showMenu, uiStore, type MenuItem } from '../state/app';
import { runCommand } from '../state/commands';
import type { Rect } from '../state/layout';
import { closePane, focusPane, paneMetaStore, workspaceStore } from '../state/workspace';
import { useStore } from '../hooks/useStore';
import { registry } from '../terminal/registry';
import { FindBar } from './FindBar';

interface Props {
  paneId: string;
  tabId: string;
  tabActive: boolean;
  multi: boolean;
  rect: Rect;
}

export const PaneView = memo(function PaneView({ paneId, tabId, tabActive, multi, rect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const isActive = useStore(workspaceStore, (s) => s.tabs.find((t) => t.id === tabId)?.activePane === paneId);
  const findOpen = useStore(uiStore, (u) => u.find === paneId);
  const exited = useStore(paneMetaStore, (m) => m[paneId]?.exited === true);

  useLayoutEffect(() => {
    const session = registry.get(paneId);
    const host = hostRef.current;
    if (!session || !host) return;
    session.attach(host);
    const ro = new ResizeObserver(() => session.scheduleFit());
    ro.observe(host);
    return () => ro.disconnect();
  }, [paneId]);

  useLayoutEffect(() => {
    registry.get(paneId)?.setVisible(tabActive);
  }, [paneId, tabActive]);

  const onContextMenu = (e: React.MouseEvent) => {
    const session = registry.get(paneId);
    if (!session) return;
    // Let full-screen mouse apps (vim, htop, tmux) receive right-clicks unless Shift is held.
    if (session.term.modes.mouseTrackingMode !== 'none' && !e.shiftKey) return;
    e.preventDefault();
    focusPane(paneId, false);
    const { settings, info } = appStore.get();
    const key = (id: string) => {
      const def = COMMANDS.find((c) => c.id === id)!;
      return formatKeys(effectiveKeys(def, settings.keybindings, info.platform), info.platform) || undefined;
    };
    const items: MenuItem[] = [
      { label: 'Copy', shortcut: key('term.copy'), disabled: !session.hasSelection(), run: () => void session.copy().then(() => session.focus()) },
      { label: 'Paste', shortcut: key('term.paste'), run: () => void session.paste() },
      { label: 'Select All', shortcut: key('term.selectAll'), run: () => session.selectAll() },
      { separator: true, label: '' },
      { label: 'Split Right', shortcut: key('pane.splitRight'), run: () => runCommand('pane.splitRight') },
      { label: 'Split Down', shortcut: key('pane.splitDown'), run: () => runCommand('pane.splitDown') },
      { separator: true, label: '' },
      { label: 'Find…', shortcut: key('term.find'), run: () => uiStore.set((u) => ({ ...u, find: paneId })) },
      { label: 'Clear Scrollback', shortcut: key('term.clear'), run: () => session.clear() },
      { separator: true, label: '' },
      { label: 'Close Pane', shortcut: key('pane.close'), run: () => void closePane(paneId) }
    ];
    showMenu(e.clientX, e.clientY, items);
  };

  const style: React.CSSProperties = {
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.w * 100}%`,
    height: `${rect.h * 100}%`
  };

  return (
    <section
      className={`pane${isActive ? ' active' : ''}${multi ? ' multi' : ''}${exited ? ' exited' : ''}`}
      style={style}
      onPointerDownCapture={() => focusPane(paneId, false)}
      onContextMenu={onContextMenu}
    >
      <div className="pane-host" ref={hostRef} />
      {findOpen && <FindBar paneId={paneId} />}
    </section>
  );
});
