import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api, money } from '../api';
import { Field } from '../components/Field';
import { TransactionSearch } from '../components/TransactionSearch';
import { Pager, TransactionTable, type Tx, type TxPage } from '../components/TransactionTable';
import { useToast } from '../toast';
import { defaultFilter, filterQuery, type FilterErrors, type TransactionFilterValues } from '../transactionSearch';

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

export interface StaffTx extends Tx {
  status: string;
  user: { id: number; username: string };
  bidTicket?: { id: number; amount: number; status: string } | null;
  reviewedBy?: { id: number; username: string } | null;
  reviewedAt?: string | null;
  reversedBy?: number | null;
}

const TX_STATUS_OPTIONS: [string, string][] = [
  ['', 'All (not deleted)'],
  ['pending', 'Pending'],
  ['posted', 'Posted'],
  ['rejected', 'Rejected'],
  ['deleted', 'Deleted'],
];

/** stf-008: manual credit or debit for a customer, posted at once. */
function AdjustmentForm({ onPosted }: { onPosted: () => void }) {
  const toast = useToast();
  const empty = { customer: '', direction: 'credit', amount: '', reason: '' };
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const bind = (k: keyof typeof empty) => ({ name: k, value: values[k], error: errors[k], onChange: (e: { target: { value: string } }) => setValues({ ...values, [k]: e.target.value }) });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const res = await api<{ message: string }>('/staff/credit/transactions', { body: values });
      toast(res.message, 'success');
      setValues(empty);
      onPosted();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) toast(err.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} noValidate aria-label="Manual adjustment">
      <h3>Manual adjustment</h3>
      <div className="grid stats">
        <Field label="Customer (username or email)" {...bind('customer')} />
        <div className="field">
          <label htmlFor="direction">Direction</label>
          <select id="direction" name="direction" value={values.direction} onChange={(e) => setValues({ ...values, direction: e.target.value })}>
            <option value="credit">Credit (add)</option>
            <option value="debit">Debit (take away)</option>
          </select>
        </div>
        <Field label="Adjustment amount" inputMode="decimal" {...bind('amount')} />
      </div>
      <Field label="Reason" {...bind('reason')} />
      <button className="btn btn-primary" type="submit" disabled={busy}>
        Post adjustment
      </button>
    </form>
  );
}

/** Staff - Credit Management: pending requests (stf-007), every transaction with search, adjustments (stf-008). */
export function StaffCreditPage() {
  const [filter, setFilter] = useState<TransactionFilterValues>(() => defaultFilter());
  const [customer, setCustomer] = useState('');
  const [status, setStatus] = useState('');
  const [applied, setApplied] = useState({ customer: '', status: '' });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TxPage<StaffTx> | null>(null);
  const [serverErrors, setServerErrors] = useState<FilterErrors>({});
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const extra: Record<string, string | number> = { page, pageSize: 20, ...applied };
    api<TxPage<StaffTx>>(`/staff/credit/transactions?${filterQuery(filter, extra)}`)
      .then((r) => {
        setResult(r);
        setServerErrors({});
      })
      .catch((err) => err instanceof ApiError && setServerErrors(err.fields as FilterErrors));
  }, [filter, applied, page, reload]);
  const refresh = () => setReload((n) => n + 1);

  return (
    <div>
      <h1>Credit management</h1>
      <h2>Pending requests</h2>
      <PendingRequests onReviewed={refresh} />

      <AdjustmentForm onPosted={refresh} />

      <h2>Transactions</h2>
      <TransactionSearch
        serverErrors={serverErrors}
        onSearch={(f) => {
          setFilter(f);
          setApplied({ customer: customer.trim(), status });
          setPage(1);
        }}
        onClear={() => {
          setCustomer('');
          setStatus('');
          setApplied({ customer: '', status: '' });
        }}
      >
        <div className="field">
          <label htmlFor="trx-customer">Customer</label>
          <input id="trx-customer" name="customer" value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="trx-status">Status</label>
          <select id="trx-status" name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {TX_STATUS_OPTIONS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </TransactionSearch>
      {!result ? (
        <p className="muted">Loading...</p>
      ) : result.transactions.length === 0 ? (
        <p className="muted" data-testid="tx-empty">
          No transactions match.
        </p>
      ) : (
        <>
          <TransactionTable
            rows={result.transactions}
            extraColumns={[
              { header: 'Customer', cell: (t) => t.user.username },
              {
                header: 'Open',
                cell: (t) => (
                  <Link className="btn btn-ghost btn-small" to={`/staff/credit/${t.id}`} aria-label={`View transaction ${t.id}`}>
                    View
                  </Link>
                ),
              },
            ]}
          />
          <Pager page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

const REVERSIBLE = ['topup', 'withdraw', 'adjustment'];

/** stf-008: one transaction: details, edit (amount while pending, description always), delete, reverse. */
export function StaffCreditDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [t, setT] = useState<StaffTx | null>(null);
  const [problem, setProblem] = useState('');
  const [editing, setEditing] = useState<{ amount: string; description: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<'delete' | 'reverse' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ transaction: StaffTx }>(`/staff/credit/transactions/${id}`)
      .then((r) => setT(r.transaction))
      .catch((err) => setProblem(err instanceof ApiError ? err.message : 'Could not load the transaction'));
  }, [id]);
  useEffect(load, [load]);

  if (problem) return <p className="muted">{problem}</p>;
  if (!t) return <p className="muted">Loading...</p>;
  const pending = t.status === 'pending';
  const canDelete = t.status === 'pending' || t.status === 'rejected';
  const canReverse = t.status === 'posted' && REVERSIBLE.includes(t.transactionType) && !t.reversedBy && !t.description?.startsWith('Reversal of #');

  const run = async (fn: () => Promise<{ message: string; transaction?: StaffTx }>, after?: (r: { transaction?: StaffTx }) => void) => {
    setBusy(true);
    setErrors({});
    try {
      const res = await fn();
      toast(res.message, 'success');
      after?.(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) toast(err.message, 'error');
      }
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const body: Record<string, string> = { description: editing.description };
    if (pending) body.amount = editing.amount;
    run(
      () => api(`/staff/credit/transactions/${id}`, { method: 'PATCH', body }),
      () => {
        setEditing(null);
        load();
      },
    );
  };

  return (
    <div className="card" style={{ maxWidth: 820, margin: '0 auto' }}>
      <p className="small">
        <Link to="/staff/credit">← Credit management</Link>
      </p>
      <div className="row spread">
        <h1>Transaction #{t.id}</h1>
        <span className={`badge badge-${t.status}`} data-testid="tx-detail-status">
          {t.status}
        </span>
      </div>
      {editing ? (
        <form onSubmit={save} noValidate aria-label="Edit transaction">
          {pending ? (
            <Field label="Amount" name="amount" inputMode="decimal" value={editing.amount} error={errors.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} />
          ) : (
            <p className="notice">Posted amounts cannot change; use Reverse instead.</p>
          )}
          <Field label="Description" name="description" value={editing.description} error={errors.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          <div className="row">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              Save changes
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="details" data-testid="tx-details">
          <dt>Customer</dt>
          <dd>{t.user.username}</dd>
          <dt>Type</dt>
          <dd>{t.transactionType}{t.direction ? ` (${t.direction})` : ''}</dd>
          <dt>Amount</dt>
          <dd data-testid="tx-amount">{money(t.amount)}</dd>
          <dt>Description</dt>
          <dd>{t.description}</dd>
          <dt>Credit before / after</dt>
          <dd>
            {money(t.balanceBefore)} → {money(t.balanceAfter)}
          </dd>
          <dt>Auction</dt>
          <dd>{t.auction ? <Link to={`/auctions/${t.auction.id}`}>{t.auction.name}</Link> : '-'}</dd>
          <dt>Bid</dt>
          <dd>{t.bidTicket ? `${money(t.bidTicket.amount)} (${t.bidTicket.status})` : '-'}</dd>
          <dt>Created</dt>
          <dd>{new Date(t.createdAt).toLocaleString()}</dd>
          <dt>Reviewed</dt>
          <dd>{t.reviewedAt ? `${new Date(t.reviewedAt).toLocaleString()} by ${t.reviewedBy?.username ?? 'staff'}` : '-'}</dd>
          {t.rejectionReason && (
            <>
              <dt>Rejection reason</dt>
              <dd>{t.rejectionReason}</dd>
            </>
          )}
          {t.reversedBy && (
            <>
              <dt>Reversed by</dt>
              <dd>
                <Link to={`/staff/credit/${t.reversedBy}`}>#{t.reversedBy}</Link>
              </dd>
            </>
          )}
        </dl>
      )}

      {!editing && t.status !== 'deleted' && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setEditing({ amount: String(t.amount), description: t.description ?? '' })}>
            Edit
          </button>
          {confirm ? (
            <span className="row" role="group" aria-label={`Confirm ${confirm}`}>
              <span className="small">{confirm === 'delete' ? 'Delete this request?' : `Post an opposite adjustment of ${money(t.amount)}?`}</span>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() =>
                  confirm === 'delete'
                    ? run(() => api(`/staff/credit/transactions/${id}`, { method: 'DELETE' }), () => navigate('/staff/credit'))
                    : run(() => api(`/staff/credit/transactions/${id}/reverse`, { method: 'POST' }), (r) => r.transaction && navigate(`/staff/credit/${r.transaction.id}`))
                }
              >
                Yes, {confirm}
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
                Keep
              </button>
            </span>
          ) : (
            <>
              {canDelete && (
                <button className="btn btn-danger" onClick={() => setConfirm('delete')}>
                  Delete
                </button>
              )}
              {canReverse && (
                <button className="btn btn-danger" onClick={() => setConfirm('reverse')}>
                  Reverse
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
