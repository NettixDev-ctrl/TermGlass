import { uiStore } from '../state/app';
import { useStore } from '../hooks/useStore';

export function Toast() {
  const toast = useStore(uiStore, (u) => u.toast);
  if (!toast) return null;
  return (
    <div className="toast glass" role="status" key={toast.id}>
      {toast.text}
    </div>
  );
}
