import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, api, money, type Auction } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toast';

export interface Bid {
  id: number;
  amount: number;
  status: string;
  createdAt: string;
  bidder: { id: number; username: string };
}

export function BidPanel({ auction, onBid }: { auction: Auction; onBid: () => void }) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auction.nextMinBid != null) setAmount(String(auction.nextMinBid));
  }, [auction.nextMinBid]);

  if (auction.status === 'cancelled') return <p className="muted">This auction was cancelled and no longer accepts bids.</p>;
  if (auction.status === 'ended') return <p className="muted">This auction has ended and no longer accepts bids.</p>;
  if (auction.status === 'upcoming') return <p className="muted">Bidding opens when the auction starts.</p>;
  if (!user)
    return (
      <p>
        <Link to="/login" state={{ from: location.pathname }} className="btn btn-primary">
          Log in to bid
        </Link>
      </p>
    );
  if (auction.isOwner) return <p className="muted">You can't bid on your own auction.</p>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api(`/auctions/${auction.id}/bids`, { body: { amount } });
      toast(`Bid of ${money(Number(amount))} placed`, 'success');
      refresh();
      onBid();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.fields.amount ?? err.message);
        onBid();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="bid-amount">Your bid</label>
        <input id="bid-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!error || undefined} />
        {error && (
          <span className="field-error" role="alert">
            {error}
          </span>
        )}
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Placing...' : 'Place bid'}
      </button>
      <span className="muted small">Available credit: {money(user.creditBalance - user.heldBalance)}</span>
    </form>
  );
}

export function BidHistory({ bids }: { bids: Bid[] }) {
  if (bids.length === 0) return <p className="muted">No bids yet.</p>;
  return (
    <div className="table-wrap">
      <table data-testid="bid-history">
        <thead>
          <tr>
            <th>Bidder</th>
            <th>Amount</th>
            <th>Time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {bids.map((b) => (
            <tr key={b.id}>
              <td>{b.bidder.username}</td>
              <td>{money(b.amount)}</td>
              <td>{new Date(b.createdAt).toLocaleString()}</td>
              <td>
                <span className={`badge badge-${b.status === 'active' ? 'winning' : b.status}`}>{b.status === 'active' ? 'leading' : b.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
