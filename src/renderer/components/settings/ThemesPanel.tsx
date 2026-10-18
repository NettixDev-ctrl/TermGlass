import { api } from '../../api';
import { appStore } from '../../state/app';
import { useStore } from '../../hooks/useStore';
import { Row, Section } from './controls';

const SAMPLE = `{
  "id": "midnight-ink",
  "name": "Midnight Ink",
  "type": "dark",
  "ui": { "accent": "#b69cff" },
  "terminal": {
    "background": "#0d0f1a",
    "foreground": "#dfe3f5",
    "cursor": "#b69cff",
    "red": "#ff7a93",
    "green": "#9be3b0",
    "blue": "#7ea6ff"
  }
}`;

export function ThemesPanel() {
  const custom = useStore(appStore, (s) => s.customThemes);
  const errors = useStore(appStore, (s) => s.themeErrors);
  return (
    <>
      <Section title="Custom themes">
        <Row label="Themes folder" hint="Drop .json files here; they are picked up automatically.">
          <button className="btn" onClick={() => void api().themes.reveal()}>Open folder</button>
        </Row>
        <Row label="Loaded" stack>
          {custom.length === 0 ? <span className="muted">No custom themes found.</span> : <ul className="plain-list">{custom.map((t) => <li key={t.id}>{t.name} <span className="muted">· {t.id} · {t.type}</span></li>)}</ul>}
        </Row>
        {errors.length > 0 && (
          <Row label="Problems" stack>
            <ul className="plain-list err">{errors.map((e) => <li key={e.file}><strong>{e.file}</strong>: {e.message}</li>)}</ul>
          </Row>
        )}
      </Section>
      <Section title="Format">
        <p className="set-intro">
          Required: <code>type</code> (“dark” or “light”). Everything else is optional; missing colors fall back to TermGlass Dark or Light, and UI colors are derived from the terminal palette. Colors accept <code>#rgb</code>, <code>#rrggbb</code>, <code>#rrggbbaa</code> and <code>rgb()</code>/<code>rgba()</code>.
        </p>
        <pre className="code-sample">{SAMPLE}</pre>
      </Section>
    </>
  );
}
