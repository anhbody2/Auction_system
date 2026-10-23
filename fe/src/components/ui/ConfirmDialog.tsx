import { useEffect, useRef, type ReactNode } from 'react';

/**
 * ui-1a.3: modal confirm (role=dialog). Focus starts on the confirm button; Escape, Cancel and a click on the
 * backdrop close it without doing anything.
 */
export function ConfirmDialog({ title, children, confirmLabel, busy, onConfirm, onCancel, testId }: { title: string; children: ReactNode; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void; testId?: string }) {
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirm.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="idle-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="ui-card confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" data-testid={testId}>
        <h2 id="confirm-title" className="ui-card-title">
          {title}
        </h2>
        <div className="confirm-body">{children}</div>
        <div className="row confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" ref={confirm} className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Placing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
