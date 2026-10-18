import { useEffect, useRef } from 'react';
import { uiStore } from '../state/app';
import { useStore } from '../hooks/useStore';

export function ConfirmDialog() {
  const req = useStore(uiStore, (u) => u.confirm);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!req) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        req.resolve(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req]);

  if (!req) return null;
  return (
    <div className="scrim" onPointerDown={() => req.resolve(false)}>
      <div className="dialog glass" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg" onPointerDown={(e) => e.stopPropagation()}>
        <h2 id="confirm-title">{req.title}</h2>
        <p id="confirm-msg">{req.message}</p>
        <div className="dialog-actions">
          <button className="btn" onClick={() => req.resolve(false)}>Cancel</button>
          <button ref={okRef} className={`btn primary${req.danger ? ' danger' : ''}`} onClick={() => req.resolve(true)}>{req.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
