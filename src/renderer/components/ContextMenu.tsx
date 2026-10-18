import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hideMenu, uiStore } from '../state/app';
import { useStore } from '../hooks/useStore';
import { registry } from '../terminal/registry';
import { getActivePaneId } from '../state/workspace';

export function ContextMenu() {
  const menu = useStore(uiStore, (u) => u.menu);
  if (!menu) return null;
  return <MenuInner key={`${menu.x}:${menu.y}`} menu={menu} />;
}

function MenuInner({ menu }: { menu: NonNullable<ReturnType<typeof uiStore.get>['menu']> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  const [index, setIndex] = useState(-1);
  const enabled = menu.items.map((it, i) => (!it.separator && !it.disabled ? i : -1)).filter((i) => i >= 0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(6, Math.min(menu.x, window.innerWidth - r.width - 6)), y: Math.max(6, Math.min(menu.y, window.innerHeight - r.height - 6)) });
  }, [menu.x, menu.y]);

  const close = (refocus = true) => {
    hideMenu();
    if (refocus) registry.get(getActivePaneId())?.focus();
  };

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const at = enabled.indexOf(index);
        const next = e.key === 'ArrowDown' ? enabled[(at + 1) % enabled.length] : enabled[(at <= 0 ? enabled.length : at) - 1];
        setIndex(next ?? -1);
      } else if (e.key === 'Enter' && index >= 0) {
        e.preventDefault();
        e.stopPropagation();
        activate(index);
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', () => close(false));
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [index]);

  const activate = (i: number) => {
    const item = menu.items[i];
    if (!item || item.disabled || item.separator) return;
    hideMenu();
    item.run?.();
    // Menus that open other UI keep focus there; otherwise return to the terminal.
    queueMicrotask(() => {
      const ui = uiStore.get();
      if (!ui.palette && !ui.settings.open && !ui.confirm && !ui.renamingTab && !ui.find) registry.get(getActivePaneId())?.focus();
    });
  };

  return (
    <div className="menu glass" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((item, i) =>
        item.separator ? (
          <div key={i} className="menu-sep" role="separator" />
        ) : (
          <button
            key={i}
            className={`menu-item${i === index ? ' focus' : ''}`}
            role="menuitem"
            disabled={item.disabled}
            onPointerEnter={() => !item.disabled && setIndex(i)}
            onClick={() => activate(i)}
          >
            <span>{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        )
      )}
    </div>
  );
}
