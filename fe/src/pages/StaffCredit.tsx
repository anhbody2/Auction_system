import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, money } from '../api';
import { useToast } from '../toast';

export interface CreditRequest {
  id: number;
  transactionType: 'topup' | 'withdraw';
  amount: number;
  status: string;
  createdAt: string;
  user: { id: number; username: string };
}

/** stf-007: pending top-up / withdrawal requests; approve, or reject with a reason. */
export function PendingRequests({ onReviewed }: { onReviewed?: () => void }) {
  const toast = useToast();
  const [requests, setRequests] = useState<CreditRequest[] | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ requests: CreditRequest[] }>('/staff/credit/requests').then((r) => setRequests(r.requests));
  }, []);
  useEffect(load, [load]);

  const review = async (id: number, decision: 'approve' | 'reject') => {
    setBusy(true);
    setReasonError('');
    try {
      const res = await api<{ message: string }>(`/staff/credit/requests/${id}/${decision}`, { method: 'POST', body: decision === 'reject' ? { reason } : undefined });
      toast(res.message, 'success');
      setRejecting(null);
      setReason('');
      load();
      onReviewed?.();
    } catch (err) {
      if (err instanceof ApiError && err.fields.reason) setReasonError(err.fields.reason);
      else toast(err instanceof ApiError ? err.message : 'Something went wrong', 'error');
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!requests) return <p className="muted">Loading...</p>;
  if (requests.length === 0)
    return (
      <p className="muted" data-testid="no-requests">
        No requests waiting for approval.
      </p>
    );
  return (
    <div className="table-wrap">
      <table data-testid="credit-requests">
        <thead>
          <tr>
            <th>ID</th>
            <th>Customer</th>
            <th>Request</th>
            <th>Amount</th>
            <th>Requested</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id} data-testid={`request-${r.id}`}>
              <td>{r.id}</td>
              <td>{r.user.username}</td>
              <td>{r.transactionType === 'topup' ? 'Top up' : 'Withdrawal'}</td>
              <td>{money(r.amount)}</td>
              <td>{new Date(r.createdAt).toLocaleString()}</td>
              <td>
                {rejecting === r.id ? (
                  <form
                    className="row"
                    aria-label={`Reject request ${r.id}`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      review(r.id, 'reject');
                    }}
                  >
                    <label className="field">
                      Reason
                      <input name="reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} aria-invalid={!!reasonError || undefined} />
                      {reasonError && (
                        <span className="field-error" role="alert">
                          {reasonError}
                        </span>
                      )}
                    </label>
                    <button className="btn btn-danger btn-small" type="submit" disabled={busy}>
                      Confirm reject
                    </button>
                    <button className="btn btn-ghost btn-small" type="button" onClick={() => setRejecting(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <span className="row">
                    <button className="btn btn-primary btn-small" disabled={busy} onClick={() => review(r.id, 'approve')} aria-label={`Approve request ${r.id}`}>
                      Approve
                    </button>
                    <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => setRejecting(r.id)} aria-label={`Reject request ${r.id}`}>
                      Reject
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Staff - Credit Management. stf-007: pending requests. (stf-008 adds the full transaction list.) */
export function StaffCreditPage() {
  return (
    <div>
      <h1>Credit management</h1>
      <h2>Pending requests</h2>
      <PendingRequests />
    </div>
  );
}
