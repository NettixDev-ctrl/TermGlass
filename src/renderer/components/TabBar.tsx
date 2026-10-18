import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { appStore, showMenu, showShellPicker, uiStore } from '../state/app';
import {
  closeOtherTabs,
  closeTab,
  focusActivePane,
  closeTabsToRight,
  duplicateTab,
  moveTab,
  newTab,
  paneMetaStore,
  renameTab,
  selectTab,
  tabTitle,
  workspaceStore,
  type Tab
} from '../state/workspace';
import { formatKeys, effectiveKeys, COMMANDS } from '@shared/keybindings';
import { useStore } from '../hooks/useStore';
import { ChevronDownIcon, CloseIcon, PlusIcon } from './Icons';

interface DragState {
  id: string;
  index: number;
  startX: number;
  rects: DOMRect[];
  moved: boolean;
  target: number;
  pointerId: number;
}

const DRAG_THRESHOLD = 5;

export function TabBar() {
  const tabs = useStore(workspaceStore, (s) => s.tabs);
  const activeId = useStore(workspaceStore, (s) => s.activeTabId);
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Keep the active tab visible when the strip overflows.
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId, tabs.length]);

  const tabEls = () => [...(listRef.current?.querySelectorAll<HTMLElement>('.tab') ?? [])];

  const clearTransforms = () => {
    for (const el of tabEls()) {
      el.style.transform = '';
      el.style.transition = '';
      el.style.zIndex = '';
    }
  };

  const onPointerDown = (e: React.PointerEvent, tab: Tab, index: number) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.tab-close, input')) return;
    selectTab(tab.id);
    drag.current = {
      id: tab.id,
      index,
      startX: e.clientX,
      rects: tabEls().map((el) => el.getBoundingClientRect()),
      moved: false,
      target: index,
      pointerId: e.pointerId
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      d.moved = true;
      setDraggingId(d.id);
    }
    const els = tabEls();
    const dragged = d.rects[d.index]!;
    // Clamp the dragged tab to the strip so it can't be lost off-screen.
    const minDx = d.rects[0]!.left - dragged.left;
    const maxDx = d.rects[d.rects.length - 1]!.right - dragged.right;
    const clamped = Math.min(maxDx, Math.max(minDx, dx));
    const center = dragged.left + dragged.width / 2 + clamped;
    let target = d.index;
    d.rects.forEach((r, i) => {
      if (center >= r.left && center < r.right) target = i;
    });
    d.target = target;
    els.forEach((el, i) => {
      if (i === d.index) {
        el.style.transition = 'none';
        el.style.transform = `translateX(${clamped}px)`;
        el.style.zIndex = '3';
        return;
      }
      let shift = 0;
      if (d.index < target && i > d.index && i <= target) shift = -(dragged.width);
      if (d.index > target && i < d.index && i >= target) shift = dragged.width;
      el.style.transform = shift ? `translateX(${shift}px)` : '';
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    if (d.moved) {
      flushSync(() => {
        moveTab(d.index, d.target);
        setDraggingId(null);
      });
      clearTransforms();
    }
    focusActivePane();
  };

  const openTabMenu = (e: React.MouseEvent, tab: Tab) => {
    e.preventDefault();
    const idx = tabs.findIndex((t) => t.id === tab.id);
    showMenu(e.clientX, e.clientY, [
      { label: 'Rename Tab', run: () => uiStore.set((u) => ({ ...u, renamingTab: tab.id })) },
      { label: 'Duplicate Tab', run: () => duplicateTab(tab.id) },
      { separator: true, label: '' },
      { label: 'Close Tab', run: () => void closeTab(tab.id) },
      { label: 'Close Other Tabs', disabled: tabs.length < 2, run: () => void closeOtherTabs(tab.id) },
      { label: 'Close Tabs to the Right', disabled: idx >= tabs.length - 1, run: () => void closeTabsToRight(tab.id) }
    ]);
  };

  const onWheel = useCallback((e: React.WheelEvent) => {
    const el = listRef.current;
    if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
  }, []);

  const platform = useStore(appStore, (s) => s.info.platform);
  const keys = useStore(appStore, (s) => s.settings.keybindings);
  const newTabKeys = formatKeys(effectiveKeys(COMMANDS.find((c) => c.id === 'tab.new')!, keys, platform), platform);

  return (
    <div className="tabbar">
      <div className="tab-list" ref={listRef} onWheel={onWheel} role="tablist">
        {tabs.map((tab, i) => (
          <TabItem
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            dragging={tab.id === draggingId}
            onPointerDown={(e) => onPointerDown(e, tab, i)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onContextMenu={(e) => openTabMenu(e, tab)}
          />
        ))}
      </div>
      <button className="icon-btn new-tab" onClick={() => { newTab(); focusActivePane(); }} aria-label="New tab" title={`New Tab${newTabKeys ? ` (${newTabKeys})` : ''}`}>
        <PlusIcon />
      </button>
      <button
        className="icon-btn new-tab-menu"
        aria-label="New tab with a specific shell"
        aria-haspopup="dialog"
        title="New tab with shell…"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          showShellPicker('new-tab', { left: r.left - 28, top: r.top, bottom: r.bottom }, 'below');
        }}
      >
        <ChevronDownIcon />
      </button>
    </div>
  );
}

interface TabItemProps {
  tab: Tab;
  active: boolean;
  dragging: boolean;
  onPointerDown(e: React.PointerEvent): void;
  onPointerMove(e: React.PointerEvent): void;
  onPointerUp(e: React.PointerEvent): void;
  onPointerCancel(e: React.PointerEvent): void;
  onContextMenu(e: React.MouseEvent): void;
}

function TabItem({ tab, active, dragging, ...handlers }: TabItemProps) {
  const title = useStore(paneMetaStore, (m) => tabTitle(tab, m));
  const paneCount = countLeaves(tab);
  const renaming = useStore(uiStore, (u) => u.renamingTab === tab.id);
  const exited = useStore(paneMetaStore, (m) => m[tab.activePane]?.exited === true);

  return (
    <div
      className={`tab${active ? ' active' : ''}${dragging ? ' dragging' : ''}${exited ? ' exited' : ''}`}
      data-tab-id={tab.id}
      role="tab"
      aria-selected={active}
      title={title}
      onDoubleClick={() => uiStore.set((u) => ({ ...u, renamingTab: tab.id }))}
      onAuxClick={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          void closeTab(tab.id);
        }
      }}
      {...handlers}
    >
      {renaming ? (
        <RenameInput initial={tab.customTitle ?? title} onDone={(v, commit) => {
          if (commit) renameTab(tab.id, v);
          uiStore.set((u) => ({ ...u, renamingTab: null }));
        }} />
      ) : (
        <span className="tab-title">{title}</span>
      )}
      {paneCount > 1 && !renaming && <span className="tab-badge" title={`${paneCount} panes`}>{paneCount}</span>}
      <button
        className="tab-close"
        tabIndex={-1}
        aria-label="Close tab"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          void closeTab(tab.id).then(focusActivePane);
        }}
      >
        <CloseIcon size={10} />
      </button>
    </div>
  );
}

function countLeaves(tab: Tab): number {
  const walk = (n: Tab['root']): number => (n.kind === 'leaf' ? 1 : walk(n.a) + walk(n.b));
  return walk(tab.root);
}

function RenameInput({ initial, onDone }: { initial: string; onDone(value: string, commit: boolean): void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(ref.current?.value ?? '', commit);
  };
  return (
    <input
      ref={ref}
      className="tab-rename"
      defaultValue={initial}
      maxLength={80}
      spellCheck={false}
      placeholder="Tab name"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

