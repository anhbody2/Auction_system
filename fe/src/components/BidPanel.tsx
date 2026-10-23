import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError, api, money, type Auction, type Bid, type BidEvent } from '../api';
import { useAuth } from '../auth';
import { useAppDispatch } from '../store';
import { bidReceived } from '../store/auctionSlice';
import { bidPlaced } from '../store/creditSlice';
import { useCredit } from '../store/useCredit';
import { QUICK_STEPS, bidAmount, changeSinceStart, formatTyping, precheck, quickAmounts } from '../bidMath';
import { useToast } from '../toast';
import { Countdown, useNow } from './AuctionBits';
import { isEndingSoon } from './auctionCardState';
import { initials, Pill } from './ui';
import { chartLabel, priceChart } from '../priceChart';
import { relativeTime } from '../relativeTime';

export type { Bid };

/**
 * ui-1b.2: the lot page bid panel from the 1b mockup. The header (time pill, bid count, highest bid and its
 * change since the start) shows in every state; the form only while the auction is live.
 */
export function BidPanel({ auction, bids, onReload }: { auction: Auction; bids: Bid[]; onReload: () => void }) {
  const now = useNow();
  const soon = isEndingSoon(auction, now);
  const change = changeSinceStart(auction.currentPrice, auction.initialPrice);
  return (
    <div className="bid-panel">
      <div className="row spread">
        <Pill tone={soon ? 'dark-red' : auction.status === 'active' || auction.status === 'upcoming' ? 'steel' : 'muted'} dot={soon}>
          <Countdown status={auction.status} startTime={auction.startTime} endTime={auction.endTime} onElapsed={onReload} format="ends-in" />
        </Pill>
        <span className="muted small">
          <span data-testid="bid-count">{auction.bidCount}</span> bid{auction.bidCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="bid-panel-price">
        <div className="lot-price-label">{auction.currentPrice ? 'Highest bid' : 'Starting price'}</div>
        <div className="row">
          <span className="ui-money ui-money-xl" data-testid="current-price">
            {money(auction.currentPrice ?? auction.initialPrice)}
          </span>
          {change != null && (
            <span className="bid-change" data-testid="price-change" title="Change since the starting price">
              {change >= 0 ? '+' : ''}
              {change}%
            </span>
          )}
        </div>
        <PriceChart auction={auction} bids={bids} />
      </div>
      <BidForm auction={auction} bids={bids} onReload={onReload} />
    </div>
  );
}

function BidForm({ auction, bids, onReload }: { auction: Auction; bids: Bid[]; onReload: () => void }) {
  const { user } = useAuth();
  const { credit, locked } = useCredit();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const location = useLocation();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auction.nextMinBid != null) setAmount(formatTyping(String(auction.nextMinBid)));
  }, [auction.nextMinBid]);

  if (auction.status === 'cancelled') return <p className="muted">This auction was cancelled and no longer accepts bids.</p>;
  if (auction.status === 'ended') return <p className="muted">This auction has ended and no longer accepts bids.</p>;
  if (auction.status === 'upcoming') return <p className="muted">Bidding opens when the auction starts.</p>;
  if (!user)
    return (
      <Link to="/login" state={{ from: location.pathname }} className="btn btn-primary bid-submit">
        Log in to bid
      </Link>
    );
  if (auction.isOwner) return <p className="muted">You can't bid on your own auction.</p>;

  const min = auction.nextMinBid ?? auction.initialPrice;
  const value = bidAmount(amount, min);
  const quick = quickAmounts(auction.currentPrice, auction.initialPrice);

  // rt-001: where the viewer stands, kept current by pushed bid events.
  const leading = bids.find((b) => b.status === 'active');
  const hasBid = bids.some((b) => b.bidder.id === user.id);
  const standing = !hasBid ? null : leading?.bidder.id === user.id ? 'leading' : 'outbid';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Same messages as the server; the server still checks everything and its answer wins. A leader raising
    // their own bid gets the old hold back first (be/src/routes/bids.ts), so it counts as available here.
    const ownHold = leading?.bidder.id === user.id ? leading.amount : 0;
    const problem = precheck(value, min, credit - locked + ownHold);
    setError(problem ?? '');
    if (problem) return;
    setBusy(true);
    try {
      const res = await api<{ event: BidEvent; released: number }>(`/auctions/${auction.id}/bids`, { body: { amount: value } });
      // Same reducer as pushed events; the pushed copy of this bid is then ignored as a duplicate.
      dispatch(bidReceived(res.event));
      // crd-003: only locked credit changes on a bid; no refetch of the user or credit.
      dispatch(bidPlaced({ amount: res.event.bid.amount, released: res.released }));
      toast(`Bid of ${money(value)} placed`, 'success');
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

  return (
    <form onSubmit={submit} noValidate className="bid-form">
      {standing && (
        <p className={`bid-standing is-${standing}`} data-testid="my-standing" role="status">
          {standing === 'leading' ? <span data-testid="bid-ok">You're the highest bidder.</span> : <span data-testid="outbid-notice">You've been outbid.</span>}
        </p>
      )}
      <div className="field">
        <div className="row spread">
          <label htmlFor="bid-amount">Your bid</label>
          <span className="muted small">
            Min. <span data-testid="next-min-bid">{money(min)}</span>
          </span>
        </div>
        <div className="money-input">
          <span aria-hidden="true">$</span>
          {/* ui-1a.3: 'Custom bid' on a card opens the lot with ?bid=1 to start typing straight away. */}
          <input
            id="bid-amount"
            inputMode="decimal"
            value={amount}
            placeholder={formatTyping(String(min))}
            onChange={(e) => setAmount(formatTyping(e.target.value))}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'bid-error' : undefined}
            autoFocus={new URLSearchParams(location.search).get('bid') === '1'}
            data-testid="bid-input"
          />
        </div>
      </div>
      <div className="quick-bids">
        {quick.map((q, i) => (
          <button key={i} type="button" className="btn btn-steel" onClick={() => setAmount(formatTyping(String(q)))} data-testid={`quick-bid-${QUICK_STEPS[i]}`}>
            {money(q)}
          </button>
        ))}
      </div>
      {error && (
        <p className="bid-error" id="bid-error" role="alert" data-testid="bid-error">
          {error}
        </p>
      )}
      <button className="btn btn-primary bid-submit" type="submit" disabled={busy} data-testid="place-bid">
        {busy ? 'Placing...' : `Place bid ${money(value)}`}
      </button>
      <p className="muted small bid-footnote">
        Credit: {money(credit)} · Locked credit: {money(locked)}
      </p>
      <p className="muted small bid-footnote">Bids are binding · locked from your available credit until you are outbid</p>
    </form>
  );
}

/**
 * ui-1b.3: 'Bid history · Live' list, newest first: initials avatar, bidder, amount, relative time (full date
 * in the tooltip, refreshed every 30 s). The viewer's own bids are cream with a 'You' pill. Rows keep table
 * semantics (row 0 is a hidden header) so a row index means the same as in the old table.
 */
export function BidHistory({ bids }: { bids: Bid[] }) {
  const { user } = useAuth();
  const now = useNow(30_000);
  return (
    <section className="ui-card bid-history-card" aria-labelledby="bid-history-title">
      <header className="ui-card-head">
        <h2 className="ui-card-title" id="bid-history-title">
          Bid history <span className="live-dot">· Live</span>
        </h2>
        <span className="muted small">
          {bids.length} bid{bids.length === 1 ? '' : 's'}
        </span>
      </header>
      {bids.length === 0 ? (
        <p className="muted">No bids yet.</p>
      ) : (
        <div className="bid-history" role="table" aria-labelledby="bid-history-title" data-testid="bid-history">
          <div role="row" className="sr-only">
            <span role="columnheader">Bidder</span>
            <span role="columnheader">Amount</span>
            <span role="columnheader">Time</span>
            <span role="columnheader">Status</span>
          </div>
          {bids.map((b) => {
            const mine = b.bidder.id === user?.id;
            return (
              <div role="row" key={b.id} className={`bid-row ${mine ? 'is-mine' : ''}`} data-testid={`bid-row-${b.id}`}>
                <span role="cell" className="bid-who">
                  <span className="avatar avatar-sm" aria-hidden="true">
                    {initials(null, b.bidder.username)}
                  </span>
                  <span>
                    {b.bidder.username}
                    {mine && (
                      <span className="ui-pill ui-pill-cream you-pill" data-testid="you">
                        You
                      </span>
                    )}
                  </span>
                </span>
                <span role="cell" className="bid-amount">
                  {money(b.amount)}
                </span>
                <span role="cell" className="muted small" title={new Date(b.createdAt).toLocaleString()}>
                  {relativeTime(b.createdAt, now)}
                </span>
                <span role="cell" className={`bid-status is-${b.status === 'active' ? 'leading' : b.status}`}>
                  {b.status === 'active' ? 'leading' : b.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** ui-1b.3: area chart of the price from the start through every bid; hidden without bids. */
function PriceChart({ auction, bids }: { auction: Auction; bids: Bid[] }) {
  const W = 300;
  const H = 72;
  const g = priceChart(auction.initialPrice, bids.map((b) => b.amount), W, H);
  if (!g) return null;
  const last = g.points[g.points.length - 1];
  return (
    <svg
      className="price-chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={chartLabel(auction.initialPrice, last.price, bids.length, money)}
      data-testid="price-chart"
      data-points={g.points.length}
    >
      <polygon points={g.area} className="price-chart-area" />
      <polyline points={g.line} className="price-chart-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
