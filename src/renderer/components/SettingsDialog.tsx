import { useEffect } from 'react';
import { closeSettings, uiStore, type SettingsSection } from '../state/app';
import { useStore } from '../hooks/useStore';
import { CloseIcon } from './Icons';
import { AboutPanel } from './settings/AboutPanel';
import { AppearancePanel } from './settings/AppearancePanel';
import { KeyboardPanel } from './settings/KeyboardPanel';
import { ShellPanel } from './settings/ShellPanel';
import { TerminalPanel } from './settings/TerminalPanel';
import { ThemesPanel } from './settings/ThemesPanel';

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'shell', label: 'Shells' },
  { id: 'keyboard', label: 'Keyboard' },
  { id: 'themes', label: 'Themes' },
  { id: 'about', label: 'About' }
];

export function SettingsDialog() {
  const { open, section } = useStore(uiStore, (u) => u.settings);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.body.dataset.recordingShortcut !== '1' && !uiStore.get().confirm) {
        e.preventDefault();
        e.stopPropagation();
        closeSettings();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  if (!open) return null;

  const go = (id: SettingsSection) => uiStore.set((u) => ({ ...u, settings: { ...u.settings, section: id } }));

  return (
    <div className="scrim" onPointerDown={closeSettings}>
      <div className="settings glass" role="dialog" aria-modal="true" aria-label="Settings" onPointerDown={(e) => e.stopPropagation()}>
        <nav className="settings-nav" aria-label="Settings sections">
          <div className="settings-title">Settings</div>
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'on' : ''} onClick={() => go(s.id)} aria-current={section === s.id}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          <div className="settings-head">
            <h2>{SECTIONS.find((s) => s.id === section)?.label}</h2>
            <button className="icon-btn" onClick={closeSettings} aria-label="Close settings" title="Close (Esc)">
              <CloseIcon />
            </button>
          </div>
          <div className="settings-scroll" key={section}>
            {section === 'appearance' && <AppearancePanel />}
            {section === 'terminal' && <TerminalPanel />}
            {section === 'shell' && <ShellPanel />}
            {section === 'keyboard' && <KeyboardPanel />}
            {section === 'themes' && <ThemesPanel />}
            {section === 'about' && <AboutPanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
