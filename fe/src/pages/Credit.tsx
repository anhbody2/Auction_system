import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api, money } from '../api';
import { cleanAmount, formatTyping } from '../bidMath';
import { QUICK_AMOUNTS, checkCreditRequest, isCreditMode, quickText, submitLabel, type CreditMode } from '../creditForm';
import { Card, SegmentedTabs } from '../components/ui';
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

/**
 * ui-3b.1: one request form with a Top up / Withdraw switch (?mode=), a large '$' amount, quick amounts and a
 * submit button naming the amount. Requests wait for staff (stf-007); the balance changes on approval.
 */
function RequestForm({ available, onDone }: { available: number; onDone: (s: Summary) => void }) {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const mode: CreditMode = isCreditMode(params.get('mode')) ? (params.get('mode') as CreditMode) : 'topup';
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const label = mode === 'topup' ? 'Top up amount' : 'Withdraw amount';
  // A new amount replaces the old message.
  const change = (text: string) => {
    setAmount(text);
    setError('');
  };

  const setMode = (m: CreditMode) => {
    setError('');
    setParams((p) => ({ ...Object.fromEntries(p), mode: m }), { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = checkCreditRequest(mode, amount, available);
    setError(problem ?? '');
    if (problem) return;
    setBusy(true);
    try {
      const res = await api<Summary & { message: string }>(`/credit/${mode}`, { body: { amount: cleanAmount(amount) } });
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
    <form className="ui-card credit-form" onSubmit={submit} noValidate data-testid="credit-form">
      <SegmentedTabs
        variant="segment"
        tabs={[
          { value: 'topup', label: 'Top up' },
          { value: 'withdraw', label: 'Withdraw' },
        ]}
        value={mode}
        onChange={setMode}
        label="Request type"
        testId="credit-mode"
      />
      <div className="field">
        <label htmlFor="credit-amount" className="small muted">
          {label}
        </label>
        <div className="money-input">
          <span aria-hidden="true">$</span>
          <input
            id="credit-amount"
            inputMode="decimal"
            value={amount}
            placeholder="0"
            onChange={(e) => change(formatTyping(e.target.value))}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'credit-error' : undefined}
            data-testid="credit-amount"
          />
        </div>
      </div>
      <div className="quick-amounts">
        {QUICK_AMOUNTS.map((q) => (
          <button key={q} type="button" className="btn btn-steel" onClick={() => change(quickText(q))} data-testid={`quick-${q}`}>
            {money(q)}
          </button>
        ))}
      </div>
      {error && (
        <p className="bid-error" id="credit-error" role="alert" data-testid="credit-error">
          {error}
        </p>
      )}
      <button className={`btn bid-submit ${mode === 'topup' ? 'btn-primary' : 'btn-danger'}`} type="submit" disabled={busy} data-testid="credit-submit">
        {busy ? 'Sending...' : submitLabel(mode, amount)}
      </button>
      <p className="muted small bid-footnote">Requests are approved by staff · top-ups are simulated, no real payment is taken.</p>
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
      <div className="credit-layout">
        <div className="credit-side">
          <Card tone="navy">
            <div className="dash-label">Available credit</div>
            <div className="ui-money ui-money-xl" data-testid="credit-available">
              {money(data.balance - data.held)}
            </div>
            <div className="dash-sub">
              Total <span data-testid="credit-balance">{money(data.balance)}</span> · Locked in bids <span data-testid="credit-held">{money(data.held)}</span>
            </div>
          </Card>
          <RequestForm available={data.balance - data.held} onDone={onDone} />
          <Card title="Waiting for approval">
            {data.pending.length === 0 ? (
              <p className="muted" data-testid="no-pending">
                No requests waiting for approval.
              </p>
            ) : (
              <ul className="pending-list" data-testid="pending-requests">
                {data.pending.map((p) => (
                  <li key={p.id} data-testid={`pending-${p.id}`}>
                    <span className="ui-pill ui-pill-cream">Pending</span> {p.transactionType === 'topup' ? 'Top up' : 'Withdrawal'} of {money(p.amount)}
                    <span className="muted small"> · requested {new Date(p.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="credit-main">
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
      </div>
    </div>
  );
}
