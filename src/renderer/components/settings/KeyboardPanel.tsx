import { useEffect, useState } from 'react';
import { COMMANDS, buildKeyMap, comboFromEvent, defaultKeys, effectiveKeys, formatKeys, splitAlternatives, type CommandDef } from '@shared/keybindings';
import { appStore } from '../../state/app';
import { updateSettings } from '../../state/settings';
import { useStore } from '../../hooks/useStore';

export function KeyboardPanel() {
  const settings = useStore(appStore, (s) => s.settings);
  const platform = useStore(appStore, (s) => s.info.platform);
  const [recording, setRecording] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    document.body.dataset.recordingShortcut = '1';
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') return setRecording(null);
      if (e.key === 'Backspace' || e.key === 'Delete') {
        updateSettings({ keybindings: { ...settings.keybindings, [recording]: '' } });
        setMessage(null);
        return setRecording(null);
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // only modifiers so far
      const other = [...buildKeyMap(settings.keybindings, platform)].find(([c, id]) => c === combo && id !== recording);
      if (other) {
        const title = COMMANDS.find((c) => c.id === other[1])?.title ?? other[1];
        setMessage(`${formatKeys(combo, platform)} is already used by “${title}”.`);
        return;
      }
      updateSettings({ keybindings: { ...settings.keybindings, [recording]: combo } });
      setMessage(null);
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      delete document.body.dataset.recordingShortcut;
    };
  }, [recording, settings.keybindings, platform]);

  const categories = [...new Set(COMMANDS.map((c) => c.category))];
  const reset = (def: CommandDef) => {
    const { [def.id]: _gone, ...rest } = settings.keybindings;
    updateSettings({ keybindings: rest });
  };

  return (
    <>
      <p className="set-intro">
        Click a shortcut to record a new one. Press Backspace while recording to disable it, Esc to cancel. Alt+1–9 (⌘1–9 on macOS) always switches tabs.
      </p>
      {message && <p className="set-warn" role="alert">{message}</p>}
      {categories.map((cat) => (
        <section className="set-section" key={cat}>
          <h3>{cat}</h3>
          <div className="set-group">
            {COMMANDS.filter((c) => c.category === cat).map((def) => {
              const keys = effectiveKeys(def, settings.keybindings, platform);
              const overridden = Object.prototype.hasOwnProperty.call(settings.keybindings, def.id) && settings.keybindings[def.id] !== defaultKeys(def, platform);
              const isRec = recording === def.id;
              return (
                <div className="set-row" key={def.id}>
                  <div className="set-label">{def.title}</div>
                  <div className="set-control">
                    <button className={`key-chip${isRec ? ' recording' : ''}${!keys ? ' empty' : ''}`} onClick={() => { setMessage(null); setRecording(isRec ? null : def.id); }} aria-label={`Shortcut for ${def.title}`}>
                      {isRec ? 'Press keys…' : keys ? splitAlternatives(keys).map((k) => formatKeys(k, platform)).join('  ·  ') : 'Not set'}
                    </button>
                    {overridden && (
                      <button className="btn ghost" onClick={() => reset(def)}>Reset</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
