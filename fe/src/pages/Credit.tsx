import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api, money } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toast';

interface Tx {
  id: number;
  transactionType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
  auction: { id: number; name: string } | null;
}
interface Summary {
  balance: number;
  held: number;
  available: number;
  transactions: Tx[];
}

const SIGN: Record<string, string> = { topup: '+', payout: '+', release: '+', withdraw: '-', hold: '-', payment: '-' };

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
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    api<Summary>('/credit').then(setData);
  }, []);

  const onDone = (s: Summary) => {
    setData(s);
    refresh();
  };

  if (!data) return <p className="muted">Loading...</p>;
  return (
    <div>
      <h1>Credit account</h1>
      <div className="grid stats">
        <div className="card">
          <div className="muted small">Available</div>
          <div className="big" data-testid="credit-available">{money(data.available)}</div>
        </div>
        <div className="card">
          <div className="muted small">Held in active bids</div>
          <div className="big" data-testid="credit-held">{money(data.held)}</div>
        </div>
        <div className="card">
          <div className="muted small">Total balance</div>
          <div className="big" data-testid="credit-balance">{money(data.balance)}</div>
        </div>
      </div>
      <div className="grid stats" style={{ marginTop: '1rem' }}>
        <AmountForm action="topup" label="Top up" onDone={onDone} />
        <AmountForm action="withdraw" label="Withdraw" onDone={onDone} />
      </div>
      <p className="muted small">Top-ups are simulated; no real payment is taken.</p>

      <h2>Transaction history</h2>
      {data.transactions.length === 0 ? (
        <p className="muted">No transactions yet.</p>
      ) : (
        <div className="table-wrap">
          <table data-testid="transactions">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Details</th>
                <th>Amount</th>
                <th>Available after</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.createdAt).toLocaleString()}</td>
                  <td>
                    <span className="badge">{t.transactionType}</span>
                  </td>
                  <td>
                    {t.description}
                    {t.auction && (
                      <>
                        {' · '}
                        <Link to={`/auctions/${t.auction.id}`}>{t.auction.name}</Link>
                      </>
                    )}
                  </td>
                  <td>
                    {SIGN[t.transactionType]}
                    {money(t.amount)}
                  </td>
                  <td>{money(t.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
