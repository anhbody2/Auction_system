import { useState } from 'react';
import { ApiError, api } from '../api';
import { useToast } from '../toast';

/** adm-004: delete with an inline confirmation step. The server refuses users with open auctions or leading bids. */
export function DeleteUser({ user, onDeleted }: { user: { id: number; username: string }; onDeleted: () => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      const res = await api<{ message: string }>(`/admin/users/${user.id}`, { method: 'DELETE' });
      toast(res.message, 'success');
      onDeleted();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Delete failed', 'error');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (!confirming) {
    return (
      <button className="btn btn-ghost btn-small" onClick={() => setConfirming(true)} aria-label={`Delete ${user.username}`}>
        Delete
      </button>
    );
  }
  return (
    <span className="row" role="group" aria-label={`Confirm delete ${user.username}`}>
      <span className="small">Delete {user.username}?</span>
      <button className="btn btn-danger btn-small" onClick={remove} disabled={busy}>
        Yes, delete
      </button>
      <button className="btn btn-ghost btn-small" onClick={() => setConfirming(false)}>
        Keep
      </button>
    </span>
  );
}
