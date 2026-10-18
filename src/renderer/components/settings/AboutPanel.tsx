import { appStore, resolveTheme } from '../../state/app';
import { resetSettings } from '../../state/settings';
import { useStore } from '../../hooks/useStore';
import { Row, Section } from './controls';

export function AboutPanel() {
  const info = useStore(appStore, (s) => s.info);
  const shells = useStore(appStore, (s) => s.shellList.shells);
  const theme = resolveTheme(appStore.get());
  return (
    <>
      <Section title="TermGlass">
        <Row label="Version">{info.version}</Row>
        <Row label="Runtime">Electron {info.electron} · Chromium {info.chrome}</Row>
        <Row label="Platform">{info.platform}</Row>
        <Row label="Theme">{theme.name}</Row>
        <Row label="Settings folder" stack><code className="path">{info.userDataDir}</code></Row>
        <Row label="Detected shells" stack>
          <ul className="plain-list">{shells.map((s) => <li key={s.id}>{s.name} <span className="muted">· {s.path}</span></li>)}</ul>
        </Row>
        <Row label="License">MIT</Row>
      </Section>
      <Section title="Reset">
        <Row label="Restore defaults" hint="Resets every preference and keyboard shortcut.">
          <button className="btn danger-ghost" onClick={() => resetSettings()}>Reset settings</button>
        </Row>
      </Section>
    </>
  );
}
