import { allThemes, appStore } from '../../state/app';
import { ACCENT_PRESETS } from '../../state/accents';
import { updateSettings } from '../../state/settings';
import { useStore } from '../../hooks/useStore';
import { effectiveAccent } from '../../terminal/config';
import { resolveTheme } from '../../state/app';
import { Row, Section, Segmented, Slider, Toggle } from './controls';

export function AppearancePanel() {
  const settings = useStore(appStore, (s) => s.settings);
  const info = useStore(appStore, (s) => s.info);
  const customThemes = useStore(appStore, (s) => s.customThemes);
  const themes = allThemes({ customThemes });
  const theme = resolveTheme({ customThemes, settings });
  const accent = effectiveAccent(settings, theme);
  const canTranslucent = info.translucent && (info.platform !== 'win32' || settings.windowBlur);

  return (
    <>
      <Section title="Theme">
        <div className="theme-grid" role="radiogroup" aria-label="Theme">
          {themes.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={t.id === settings.themeId} className={`theme-card${t.id === settings.themeId ? ' on' : ''}`} onClick={() => updateSettings({ themeId: t.id })}>
              <span className="theme-preview" style={{ background: t.terminal.background, color: t.terminal.foreground, borderColor: t.ui.border }}>
                <span className="tp-line"><i style={{ background: t.terminal.green }} /><i style={{ background: t.terminal.foreground, opacity: 0.8, width: 26 }} /></span>
                <span className="tp-line"><i style={{ background: t.terminal.blue }} /><i style={{ background: t.terminal.yellow, width: 18 }} /><i style={{ background: t.terminal.magenta, width: 10 }} /></span>
                <span className="tp-line"><i style={{ background: t.ui.accent, width: 6 }} /></span>
              </span>
              <span className="theme-name">{t.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Accent">
        <Row label="Accent color" hint="Used for focus, selection and highlights.">
          <div className="swatches" role="radiogroup" aria-label="Accent color">
            <button type="button" role="radio" aria-checked={settings.accent === null} className={`swatch default${settings.accent === null ? ' on' : ''}`} title="Theme default" onClick={() => updateSettings({ accent: null })}>
              <span style={{ background: theme.ui.accent }} />
            </button>
            {ACCENT_PRESETS.map((a) => (
              <button key={a.name} type="button" role="radio" aria-checked={settings.accent === a.value} className={`swatch${settings.accent === a.value ? ' on' : ''}`} title={a.name} onClick={() => updateSettings({ accent: a.value })}>
                <span style={{ background: a.value }} />
              </button>
            ))}
            <label className="swatch custom" title="Custom color">
              <span style={{ background: accent }} />
              <input type="color" aria-label="Custom accent color" value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : '#4c8dff'} onChange={(e) => updateSettings({ accent: e.target.value })} />
            </label>
          </div>
        </Row>
      </Section>

      <Section title="Window">
        <Row label="Transparency" hint={canTranslucent ? 'Lower values let the desktop show through the window.' : info.platform === 'linux' ? 'Needs “Translucent window” below (restart) and a compositor.' : info.platform === 'win32' ? 'On Windows this needs Background blur (acrylic).' : 'Not available on this system.'}>
          <Slider label="Window opacity" value={Math.round(settings.windowOpacity * 100)} min={50} max={100} step={1} format={(v) => `${v}%`} disabled={!canTranslucent} onChange={(v) => updateSettings({ windowOpacity: v / 100 })} />
        </Row>
        {info.windowBlurSupported && (
          <Row label="Background blur" hint={info.platform === 'win32' ? 'Acrylic material (Windows 11).' : 'Vibrancy behind the window (macOS).'}>
            <Toggle label="Background blur" checked={settings.windowBlur} onChange={(v) => updateSettings({ windowBlur: v })} />
          </Row>
        )}
        {info.platform === 'linux' && (
          <Row label="Translucent window" hint="Creates the window with a transparent surface. Restart required. On KDE Plasma, enable the Blur effect (or a “Force blur” window rule) to blur what is behind it.">
            <Toggle label="Translucent window" checked={settings.translucentWindow} onChange={(v) => updateSettings({ translucentWindow: v })} />
          </Row>
        )}
        <Row label="Panel blur" hint="Blur behind the command palette, menus and dialogs. Kept low to stay light on the GPU.">
          <Slider label="Panel blur" value={settings.glassBlur} min={0} max={24} step={1} format={(v) => (v === 0 ? 'Off' : `${v}px`)} onChange={(v) => updateSettings({ glassBlur: v })} />
        </Row>
        <Row label="Status bar">
          <Toggle label="Show status bar" checked={settings.showStatusBar} onChange={(v) => updateSettings({ showStatusBar: v })} />
        </Row>
      </Section>

      <Section title="Motion">
        <Row label="Animations" hint="Reduced keeps fades but removes movement.">
          <Segmented label="Animations" value={settings.animations} onChange={(v) => updateSettings({ animations: v })} options={[{ value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }, { value: 'off', label: 'Off' }]} />
        </Row>
      </Section>
    </>
  );
}
