import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, api, money, type Auction, type Bid, type BidEvent } from '../api';
import { useAuth } from '../auth';
import { useAppDispatch } from '../store';
import { bidReceived } from '../store/auctionSlice';
import { useToast } from '../toast';

export type { Bid };

export function BidPanel({ auction, bids, onReload }: { auction: Auction; bids: Bid[]; onReload: () => void }) {
  const { user, refresh } = useAuth();
  const dispatch = useAppDispatch();
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
      const res = await api<{ event: BidEvent }>(`/auctions/${auction.id}/bids`, { body: { amount } });
      // Same reducer as pushed events; the pushed copy of this bid is then ignored as a duplicate.
      dispatch(bidReceived(res.event));
      toast(`Bid of ${money(Number(amount))} placed`, 'success');
      refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.fields.amount ?? err.message);
        // Someone may have bid first: reload so the panel shows the new minimum.
        onReload();
      }
    } finally {
      setBusy(false);
    }
  };

  // rt-001: where the viewer stands, kept current by pushed bid events.
  const leading = bids.find((b) => b.status === 'active');
  const hasBid = bids.some((b) => b.bidder.id === user.id);
  const standing = !hasBid ? null : leading?.bidder.id === user.id ? 'leading' : 'outbid';

  return (
    <form onSubmit={submit} noValidate>
      {standing && (
        <p className={`badge standing badge-${standing === 'leading' ? 'winning' : 'outbid'}`} data-testid="my-standing" role="status">
          {standing === 'leading' ? 'You are the leading bidder' : 'You have been outbid'}
        </p>
      )}
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
      <span className="muted small">
        Credit: {money(user.creditBalance)} · Locked credit: {money(user.heldBalance)}
      </span>
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
