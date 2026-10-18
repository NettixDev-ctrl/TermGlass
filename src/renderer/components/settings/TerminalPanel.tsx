import { appStore } from '../../state/app';
import { updateSettings } from '../../state/settings';
import { useStore } from '../../hooks/useStore';
import { SETTING_LIMITS } from '@shared/settings';
import { Row, Section, Segmented, Slider, Toggle } from './controls';

const FONT_SUGGESTIONS = ['JetBrains Mono', 'JetBrainsMono Nerd Font', 'Fira Code', 'Cascadia Code', 'Cascadia Mono', 'Source Code Pro', 'IBM Plex Mono', 'Hack', 'Iosevka', 'SF Mono', 'Menlo', 'Consolas', 'DejaVu Sans Mono', 'Ubuntu Mono', 'monospace'];

export function TerminalPanel() {
  const s = useStore(appStore, (st) => st.settings);
  const L = SETTING_LIMITS;
  return (
    <>
      <Section title="Font">
        <Row label="Font family" hint="Any installed monospace font. JetBrains Mono is bundled as the fallback.">
          <input
            className="text-input"
            list="font-suggestions"
            value={s.fontFamily}
            spellCheck={false}
            aria-label="Terminal font family"
            onChange={(e) => updateSettings({ fontFamily: e.target.value })}
          />
          <datalist id="font-suggestions">
            {FONT_SUGGESTIONS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Row>
        <Row label="Font size">
          <Slider label="Font size" value={s.fontSize} min={L.fontSize.min} max={L.fontSize.max} step={1} format={(v) => `${v} pt`} onChange={(v) => updateSettings({ fontSize: v })} />
        </Row>
        <Row label="Line height">
          <Slider label="Line height" value={s.lineHeight} min={L.lineHeight.min} max={L.lineHeight.max} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateSettings({ lineHeight: v })} />
        </Row>
      </Section>

      <Section title="Cursor">
        <Row label="Shape">
          <Segmented label="Cursor shape" value={s.cursorShape} onChange={(v) => updateSettings({ cursorShape: v })} options={[{ value: 'block', label: 'Block' }, { value: 'bar', label: 'Bar' }, { value: 'underline', label: 'Underline' }]} />
        </Row>
        <Row label="Blinking">
          <Toggle label="Cursor blinking" checked={s.cursorBlink} onChange={(v) => updateSettings({ cursorBlink: v })} />
        </Row>
      </Section>

      <Section title="Behavior">
        <Row label="Scrollback" hint="Lines kept per pane. Large values use more memory.">
          <input
            className="text-input narrow"
            type="number"
            min={L.scrollback.min}
            max={L.scrollback.max}
            step={1000}
            value={s.scrollback}
            aria-label="Scrollback lines"
            onChange={(e) => updateSettings({ scrollback: Number(e.target.value) })}
          />
        </Row>
        <Row label="Copy on select" hint="Copies the selection to the clipboard as soon as you select text.">
          <Toggle label="Copy on select" checked={s.copyOnSelect} onChange={(v) => updateSettings({ copyOnSelect: v })} />
        </Row>
        <Row label="GPU rendering" hint="Uses WebGL for faster drawing. Falls back automatically when unavailable.">
          <Toggle label="GPU rendering" checked={s.gpuRendering} onChange={(v) => updateSettings({ gpuRendering: v })} />
        </Row>
      </Section>
    </>
  );
}
