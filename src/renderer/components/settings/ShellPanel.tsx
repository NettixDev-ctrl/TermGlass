import { useEffect, useState } from 'react';
import { isAbsoluteExecutablePath } from '@shared/settings';
import { parseShellArgs } from '@shared/shell-args';
import type { CustomShell, ShellInfo } from '@shared/types';
import { api } from '../../api';
import { appStore, showToast } from '../../state/app';
import { updateSettings } from '../../state/settings';
import { addCustomShell, refreshShells, removeCustomShell, setDefaultShell, setShellArgs, updateCustomShell } from '../../state/shells';
import { newTab } from '../../state/workspace';
import { useStore } from '../../hooks/useStore';
import { Row, Section, Select, Toggle } from './controls';

export function ShellPanel() {
  const s = useStore(appStore, (st) => st.settings);
  const list = useStore(appStore, (st) => st.shellList);
  const platform = useStore(appStore, (st) => st.info.platform);
  const [scanning, setScanning] = useState(false);

  const system = list.shells.find((sh) => sh.id === list.systemDefaultId);
  const missing = s.shellId !== 'auto' && !list.shells.some((sh) => sh.id === s.shellId);
  const effective = missing ? system : list.shells.find((sh) => sh.id === s.shellId) ?? system;
  const problemFor = (id: string) => list.problems.find((p) => p.id === id)?.message;

  const rescan = async () => {
    setScanning(true);
    try {
      const r = await refreshShells();
      showToast(`Found ${r.shells.length} shell${r.shells.length === 1 ? '' : 's'}`);
    } finally {
      setScanning(false);
    }
  };

  const browse = async () => {
    const dir = await api().app.pickDirectory();
    if (dir) updateSettings({ cwd: dir });
  };

  return (
    <>
      <Section title="Default shell">
        <Row label="New sessions start" hint="Used for new tabs, splits and the first tab. Switching a single pane never changes this.">
          <Select
            label="Default shell"
            value={missing ? 'auto' : s.shellId}
            onChange={(v) => setDefaultShell(v)}
            options={[{ value: 'auto', label: `System default${system ? ` (${system.name})` : ''}` }, ...list.shells.map((sh) => ({ value: sh.id, label: sh.name }))]}
          />
        </Row>
        {missing && (
          <p className="set-notice" role="alert">
            The selected shell “{s.shellId}” is no longer available. New sessions fall back to {effective ? effective.name : 'a system shell'}.
          </p>
        )}
      </Section>

      <Section title="Installed shells">
        {list.shells.length === 0 && (
          <div className="set-row">
            <span className="muted">No shells were found on this system.</span>
          </div>
        )}
        {list.shells.map((sh) => (
          <ShellRow key={sh.id} shell={sh} isDefault={!missing && s.shellId === sh.id} error={problemFor(sh.id)} />
        ))}
        <div className="set-row">
          <div className="set-label">
            <div>Detected on this system</div>
            <div className="set-hint">From {platform === 'win32' ? 'standard install folders, PATH and WSL' : '/etc/shells, your login shell and PATH'}. Only executables that exist and can be launched are listed.</div>
          </div>
          <div className="set-control">
            <button className="btn" onClick={() => void rescan()} disabled={scanning}>
              {scanning ? 'Scanning…' : 'Rescan'}
            </button>
          </div>
        </div>
      </Section>

      <Section title="Custom shells">
        {s.customShells.map((c) => (
          <CustomShellRow key={c.id} shell={c} error={problemFor(c.id)} />
        ))}
        <AddCustomShell />
      </Section>

      <Section title="Sessions">
        {platform !== 'win32' && (
          <Row label="Login shell" hint="Starts shells with -l so profile files are read. Most Linux terminals leave this off.">
            <Toggle label="Login shell" checked={s.loginShell} onChange={(v) => updateSettings({ loginShell: v })} />
          </Row>
        )}
        <Row label="Working directory" hint="Where the first tab starts. New splits and tabs follow the active pane when it can be detected.">
          <div className="inline">
            <input className="text-input" value={s.cwd} placeholder="Home directory" spellCheck={false} aria-label="Default working directory" onChange={(e) => updateSettings({ cwd: e.target.value })} />
            <button className="btn" onClick={() => void browse()}>Browse…</button>
          </div>
        </Row>
        <Row label="Confirm before closing" hint="Detecting a running program works on Linux and macOS.">
          <Select label="Confirm before closing" value={s.confirmClose} onChange={(v) => updateSettings({ confirmClose: v })} options={[{ value: 'running', label: 'When a program is running' }, { value: 'always', label: 'Always' }, { value: 'never', label: 'Never' }]} />
        </Row>
      </Section>
    </>
  );
}

function ShellRow({ shell, isDefault, error }: { shell: ShellInfo; isDefault: boolean; error?: string }) {
  const stored = useStore(appStore, (st) => st.settings.shellArgs[shell.id] ?? '');
  const [text, setText] = useState(stored);
  useEffect(() => setText(stored), [stored]);
  const parsed = parseShellArgs(text);
  const commit = () => {
    if (parsed.ok && text !== stored) setShellArgs(shell.id, text);
  };

  return (
    <div className="shell-row">
      <div className="shell-row-top">
        <span className="shell-text">
          <span className="shell-name">
            {shell.name}
            {shell.isDefault && <span className="tag">system default</span>}
            {isDefault && <span className="tag tag-accent">new sessions</span>}
            {shell.kind === 'custom' && <span className="tag">custom</span>}
          </span>
          <span className="shell-path" title={shell.path}>
            {shell.path}
            {shell.args.length > 0 && <span className="shell-args"> {shell.args.join(' ')}</span>}
          </span>
        </span>
        <button className="btn ghost" onClick={() => newTab({ shellId: shell.id })}>Open tab</button>
        <button className="btn ghost" disabled={isDefault} onClick={() => setDefaultShell(shell.id)}>{isDefault ? 'Default' : 'Make default'}</button>
      </div>
      <div className="shell-row-controls">
        <input
          className="text-input"
          value={text}
          placeholder="Startup arguments (optional)"
          spellCheck={false}
          aria-label={`Startup arguments for ${shell.name}`}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      </div>
      {!parsed.ok && <span className="field-error">{parsed.error}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function CustomShellRow({ shell, error }: { shell: CustomShell; error?: string }) {
  const [name, setName] = useState(shell.name);
  const [path, setPath] = useState(shell.path);
  useEffect(() => setName(shell.name), [shell.name]);
  useEffect(() => setPath(shell.path), [shell.path]);
  const pathValid = isAbsoluteExecutablePath(path.trim());

  const browse = async () => {
    const p = await api().shells.pickExecutable();
    if (p) updateCustomShell(shell.id, { path: p });
  };

  return (
    <div className="shell-row">
      <div className="shell-row-controls">
        <input className="text-input" style={{ flex: '0 0 150px', fontFamily: 'inherit', fontSize: 13 }} value={name} maxLength={40} aria-label="Custom shell name" onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && updateCustomShell(shell.id, { name: name.trim() })} />
        <input
          className="text-input"
          value={path}
          spellCheck={false}
          aria-label={`Executable path for ${shell.name}`}
          onChange={(e) => setPath(e.target.value)}
          onBlur={() => pathValid && path.trim() !== shell.path && updateCustomShell(shell.id, { path: path.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && pathValid && updateCustomShell(shell.id, { path: path.trim() })}
        />
        <button className="btn" onClick={() => void browse()}>Browse…</button>
        <button className="btn danger-ghost" onClick={() => removeCustomShell(shell.id)}>Remove</button>
      </div>
      {!pathValid ? <span className="field-error">Enter an absolute path to an executable.</span> : error ? <span className="field-error">{error}</span> : <span className="field-ok">Ready. Appears in the shell list above.</span>}
    </div>
  );
}

function AddCustomShell() {
  const [path, setPath] = useState('');
  const valid = isAbsoluteExecutablePath(path.trim());
  const full = useStore(appStore, (st) => st.settings.customShells.length >= 16);
  const add = (p: string) => {
    addCustomShell(p.trim());
    setPath('');
  };
  const browse = async () => {
    const p = await api().shells.pickExecutable();
    if (p) add(p);
  };
  return (
    <div className="shell-row">
      <div className="shell-row-controls">
        <input
          className="text-input"
          value={path}
          placeholder="Absolute path to a shell executable"
          spellCheck={false}
          aria-label="New custom shell path"
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && valid && !full && add(path)}
        />
        <button className="btn" onClick={() => void browse()} disabled={full}>Browse…</button>
        <button className="btn primary" onClick={() => add(path)} disabled={!valid || full}>Add</button>
      </div>
      <span className="field-ok">{full ? 'The limit of 16 custom shells has been reached.' : 'The file must exist and be executable; otherwise it is reported and not listed.'}</span>
    </div>
  );
}
