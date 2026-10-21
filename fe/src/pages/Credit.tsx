import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, money } from '../api';
import { TransactionSearch } from '../components/TransactionSearch';
import { Pager, TransactionTable, type Tx, type TxPage } from '../components/TransactionTable';
import { useAuth } from '../auth';
import { useAppDispatch } from '../store';
import { creditLoaded } from '../store/creditSlice';
import { useToast } from '../toast';
import { defaultFilter, filterQuery, type FilterErrors, type TransactionFilterValues } from '../transactionSearch';

interface Summary {
  balance: number;
  held: number;
  transactions: Tx[];
  /** stf-007: top-up / withdrawal requests waiting for staff. */
  pending: Tx[];
}

/** stf-007: fired by useUserEvents when staff approve or reject one of this user's requests. */
export const CREDIT_REQUEST_EVENT = 'credit-request-reviewed';

function AmountForm({ action, label, onDone }: { action: 'topup' | 'withdraw'; label: string; onDone: (s: Summary) => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = `${action}-amount`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api<Summary & { message: string }>(`/credit/${action}`, { body: { amount } });
      onDone(res);
      setAmount('');
      toast(res.message, 'success');
    } catch (err) {
      if (err instanceof ApiError) setError(err.fields.amount ?? err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={id}>{label} amount</label>
        <input id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!error || undefined} placeholder="0.00" />
        {error && <span className="field-error">{error}</span>}
      </div>
      <button className={action === 'topup' ? 'btn btn-primary' : 'btn btn-ghost'} type="submit" disabled={busy}>
        {label}
      </button>
    </form>
  );
}

export function CreditPage() {
  const { refresh } = useAuth();
  const dispatch = useAppDispatch();
  const [data, setData] = useState<Summary | null>(null);
  // trx-001: the history is the search result (last 30 days by default), paged.
  const [filter, setFilter] = useState<TransactionFilterValues>(() => defaultFilter());
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<TxPage | null>(null);
  const [serverErrors, setServerErrors] = useState<FilterErrors>({});

  const loadSummary = useCallback(() => {
    api<Summary>('/credit').then(setData);
  }, []);
  useEffect(loadSummary, [loadSummary]);

  const search = useCallback(async (f: TransactionFilterValues, p: number) => {
    try {
      setResult(await api<TxPage>(`/credit/transactions?${filterQuery(f, { page: p, pageSize: 20 })}`));
      setServerErrors({});
    } catch (err) {
      if (err instanceof ApiError) setServerErrors(err.fields as FilterErrors);
    }
  }, []);
  useEffect(() => {
    search(filter, page);
  }, [search, filter, page]);

  // stf-007: a reviewed request changes the balance, the pending list and the history without a reload.
  useEffect(() => {
    const onReviewed = () => {
      loadSummary();
      search(filter, page);
    };
    window.addEventListener(CREDIT_REQUEST_EVENT, onReviewed);
    return () => window.removeEventListener(CREDIT_REQUEST_EVENT, onReviewed);
  }, [loadSummary, search, filter, page]);

  const onDone = (s: Summary) => {
    setData(s);
    search(filter, page);
    // crd-003: deposits and withdrawals update the navbar credit at once.
    dispatch(creditLoaded({ credit: s.balance, locked: s.held }));
    refresh();
  };

  if (!data) return <p className="muted">Loading...</p>;
  return (
    <div>
      <h1>Credit account</h1>
      <div className="grid stats">
        <div className="card">
          <div className="muted small">Credit</div>
          <div className="big" data-testid="credit-balance">{money(data.balance)}</div>
          <div className="muted small">Changes on top up, withdrawal and when an auction closes</div>
        </div>
        <div className="card">
          <div className="muted small">Locked credit</div>
          <div className="big" data-testid="credit-held">{money(data.held)}</div>
          <div className="muted small">Held in active bids; unlocked as soon as you are outbid</div>
        </div>
      </div>
      <div className="grid stats" style={{ marginTop: '1rem' }}>
        <AmountForm action="topup" label="Top up" onDone={onDone} />
        <AmountForm action="withdraw" label="Withdraw" onDone={onDone} />
      </div>
      <p className="muted small">
        Top-ups and withdrawals are requests: staff approve them before your credit changes. Bids and withdrawals can use your credit minus your
        locked credit. Top-ups are simulated; no real payment is taken.
      </p>

      <h2>Pending requests</h2>
      {data.pending.length === 0 ? (
        <p className="muted" data-testid="no-pending">
          No requests waiting for approval.
        </p>
      ) : (
        <ul className="pending-list" data-testid="pending-requests">
          {data.pending.map((p) => (
            <li key={p.id} data-testid={`pending-${p.id}`}>
              <span className="badge badge-pending">pending</span> {p.transactionType === 'topup' ? 'Top up' : 'Withdrawal'} of {money(p.amount)}
              <span className="muted small"> · requested {new Date(p.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}

      <h2>Transaction history</h2>
      <TransactionSearch
        serverErrors={serverErrors}
        onSearch={(f) => {
          setFilter(f);
          setPage(1);
        }}
      />
      {!result ? (
        <p className="muted">Loading...</p>
      ) : result.transactions.length === 0 ? (
        <p className="muted" data-testid="tx-empty">
          {JSON.stringify(filter) === JSON.stringify(defaultFilter()) ? 'No transactions yet.' : 'No transactions match.'}
        </p>
      ) : (
        <>
          <TransactionTable rows={result.transactions} />
          <Pager page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
