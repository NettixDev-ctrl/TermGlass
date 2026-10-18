import { api } from '../api';
import { appStore } from '../state/app';
import { useStore } from '../hooks/useStore';
import { CloseIcon, MaximizeIcon, MinimizeIcon, RestoreIcon } from './Icons';

/** Minimal window buttons for Linux (frameless). Windows uses native overlay buttons, macOS its traffic lights. */
export function WindowControls() {
  const maximized = useStore(appStore, (s) => s.window.maximized);
  const w = () => api().window;
  return (
    <div className="window-controls">
      <button className="wc" onClick={() => w().minimize()} aria-label="Minimize" title="Minimize">
        <MinimizeIcon />
      </button>
      <button className="wc" onClick={() => w().toggleMaximize()} aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'}>
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button className="wc wc-close" onClick={() => w().close()} aria-label="Close" title="Close">
        <CloseIcon size={13} />
      </button>
    </div>
  );
}
