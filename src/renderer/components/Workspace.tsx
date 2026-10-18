import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { computeRects, computeSplits, leaves, type SplitInfo } from '../state/layout';
import { overlayOpen, uiStore } from '../state/app';
import { resizeSplit, workspaceStore, type Tab } from '../state/workspace';
import { useStore } from '../hooks/useStore';
import { registry } from '../terminal/registry';
import { PaneView } from './PaneView';

export function Workspace() {
  const tabs = useStore(workspaceStore, (s) => s.tabs);
  const activeId = useStore(workspaceStore, (s) => s.activeTabId);
  const activePane = useStore(workspaceStore, (s) => s.tabs.find((t) => t.id === s.activeTabId)?.activePane ?? null);
  const overlay = useStore(uiStore, overlayOpen);

  // Keep keyboard focus in the active terminal whenever nothing else (palette, dialogs, rename, find) owns it.
  useEffect(() => {
    if (overlay || !activePane) return;
    const ui = uiStore.get();
    if (ui.renamingTab || ui.find === activePane) return;
    const raf = requestAnimationFrame(() => registry.get(activePane)?.focus());
    return () => cancelAnimationFrame(raf);
  }, [activePane, activeId, overlay]);

  return (
    <main className="workspace">
      {tabs.map((tab) => (
        <TabView key={tab.id} tab={tab} active={tab.id === activeId} />
      ))}
    </main>
  );
}

/**
 * All panes of a tab are rendered as a flat, absolutely positioned list. Their React identity never depends on
 * the split tree, so a pane's DOM (and its xterm canvas) is never moved or recreated when the layout changes.
 */
const TabView = memo(function TabView({ tab, active }: { tab: Tab; active: boolean }) {
  const rects = useMemo(() => computeRects(tab.root), [tab.root]);
  const splits = useMemo(() => computeSplits(tab.root), [tab.root]);
  const ids = useMemo(() => leaves(tab.root), [tab.root]);
  const [resizing, setResizing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className={`tabview${active ? ' active' : ''}${resizing ? ' resizing' : ''}`} aria-hidden={!active} inert={!active}>
      {ids.map((id) => (
        <PaneView key={id} paneId={id} tabId={tab.id} tabActive={active} multi={ids.length > 1} rect={rects.get(id)!} />
      ))}
      {splits.map((s) => (
        <Divider key={s.id} split={s} tabId={tab.id} container={ref} onResizing={setResizing} />
      ))}
    </div>
  );
});

const DIVIDER_HIT = 9;

function Divider({ split, tabId, container, onResizing }: { split: SplitInfo; tabId: string; container: React.RefObject<HTMLDivElement | null>; onResizing(v: boolean): void }) {
  const { dir, rect, ratio } = split;
  const style: React.CSSProperties =
    dir === 'row'
      ? { left: `calc(${(rect.x + rect.w * ratio) * 100}% - ${DIVIDER_HIT / 2}px)`, top: `${rect.y * 100}%`, height: `${rect.h * 100}%`, width: DIVIDER_HIT }
      : { top: `calc(${(rect.y + rect.h * ratio) * 100}% - ${DIVIDER_HIT / 2}px)`, left: `${rect.x * 100}%`, width: `${rect.w * 100}%`, height: DIVIDER_HIT };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const box = container.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    onResizing(true);
    let frame = 0;
    const move = (ev: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next =
          dir === 'row'
            ? (ev.clientX - box.left - rect.x * box.width) / (rect.w * box.width)
            : (ev.clientY - box.top - rect.y * box.height) / (rect.h * box.height);
        resizeSplit(tabId, split.id, next);
      });
    };
    const up = () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      onResizing(false);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <div
      className={`divider divider-${dir}`}
      style={style}
      role="separator"
      aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
      onDoubleClick={() => resizeSplit(tabId, split.id, 0.5)}
    >
      <span className="divider-line" />
    </div>
  );
}

