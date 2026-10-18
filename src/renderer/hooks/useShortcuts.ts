import { useEffect } from 'react';
import { buildKeyMap, comboFromEvent } from '@shared/keybindings';
import { appStore, overlayOpen, uiStore } from '../state/app';
import { runCommand } from '../state/commands';
import { selectTabByIndex } from '../state/workspace';

/** Commands that are fine to repeat while a key is held. */
const REPEATABLE = new Set(['term.zoomIn', 'term.zoomOut', 'tab.next', 'tab.prev', 'pane.focusLeft', 'pane.focusRight', 'pane.focusUp', 'pane.focusDown', 'pane.focusNext', 'pane.focusPrev']);

/**
 * Global keyboard shortcuts. The listener runs in the capture phase so application shortcuts win over xterm,
 * while every other key falls through to the terminal untouched.
 */
export function useShortcuts(): void {
  useEffect(() => {
    let keyMap = new Map<string, string>();
    let lastKey = '';
    const rebuild = () => {
      const { settings, info } = appStore.get();
      const sig = `${info.platform}|${JSON.stringify(settings.keybindings)}`;
      if (sig === lastKey) return;
      lastKey = sig;
      keyMap = buildKeyMap(settings.keybindings, info.platform);
    };
    rebuild();
    const unsub = appStore.subscribe(rebuild);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      // The shortcut recorder in Settings needs raw keys.
      if (document.body.dataset.recordingShortcut === '1') return;
      const combo = comboFromEvent(e);
      if (!combo) return;

      const { info } = appStore.get();
      const modal = overlayOpen(uiStore.get());
      const tabKey = `${info.platform === 'darwin' ? 'Meta' : 'Alt'}+`;
      if (combo.startsWith(tabKey) && /^\d$/.test(combo.slice(tabKey.length)) && combo.slice(tabKey.length) !== '0' && !modal) {
        e.preventDefault();
        e.stopPropagation();
        selectTabByIndex(Number(combo.slice(tabKey.length)) - 1);
        return;
      }

      const id = keyMap.get(combo);
      if (!id) return;
      if (modal && id !== 'palette.open' && id !== 'window.devtools') return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat && !REPEATABLE.has(id)) return;
      runCommand(id);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      unsub();
    };
  }, []);
}
