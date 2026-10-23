import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api, money, type Auction, type BidEvent } from '../api';
import { useAuth } from '../auth';
import { useAppDispatch } from '../store';
import { bidPlaced } from '../store/creditSlice';
import { useToast } from '../toast';
import { Countdown, NewTag, useNow } from './AuctionBits';
import { isEndingSoon, priceLabel, stripState } from './auctionCardState';
import { ConfirmDialog, Pill } from './ui';

/**
 * ui-1a.1: compact lot card from the 1a Browse mockup, with the viewer's own bid position on live lots.
 * ui-1a.3: live lots also get 'Bid $X' (quick bid at the minimum next bid) and 'Custom bid'; `onChanged`
 * reloads the list after a quick bid or a refused one.
 */
export function AuctionCard({ auction, onElapsed, onChanged }: { auction: Auction; onElapsed?: () => void; onChanged?: () => void }) {
  const { user } = useAuth();
  const now = useNow();
  const ended = auction.status === 'ended';
  const soon = isEndingSoon(auction, now);
  const strip = stripState(auction, !!user);
  return (
    <article className="lot-card" data-testid={`auction-card-${auction.id}`}>
      <Link to={`/auctions/${auction.id}`} className="card-link">
        {auction.goods.images[0] ? (
          <img src={auction.goods.images[0]} alt="" className="lot-thumb" loading="lazy" />
        ) : (
          <div className="lot-thumb lot-thumb-empty" aria-hidden="true" />
        )}
        <div className="lot-body">
          <div className="lot-pills">
            {soon ? (
              <Pill tone="dark-red" dot testId="ending-soon">
                <Countdown status={auction.status} startTime={auction.startTime} endTime={auction.endTime} onElapsed={onElapsed} />
              </Pill>
            ) : (
              <Pill tone={ended || auction.status === 'cancelled' ? 'muted' : 'steel'}>
                <Countdown status={auction.status} startTime={auction.startTime} endTime={auction.endTime} onElapsed={onElapsed} />
              </Pill>
            )}
            {auction.goods.category && <Pill tone="muted">{auction.goods.category.name}</Pill>}
            <NewTag status={auction.status} startTime={auction.startTime} />
          </div>
          <h3>{auction.name}</h3>
          <div className="muted small">by {auction.seller.username}</div>
          <div className="lot-price">
            <div className="lot-price-label">{priceLabel(auction)}</div>
            <div className="row spread">
              <strong className="lot-price-value">{money(auction.currentPrice ?? auction.initialPrice)}</strong>
              <span className="muted small">
                {auction.bidCount} bid{auction.bidCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          {ended && <div className="small muted">{auction.winner ? `Won by ${auction.winner.username}` : 'No winner'}</div>}
          {strip && <MyBidStrip state={strip} amount={auction.myBid?.amount} />}
        </div>
      </Link>
      {auction.status === 'active' && !auction.isOwner && auction.nextMinBid != null && <QuickBid auction={auction} onChanged={onChanged} />}
    </article>
  );
}

function MyBidStrip({ state, amount }: { state: 'leading' | 'outbid' | 'none'; amount?: number }) {
  if (state === 'none') {
    return (
      <div className="my-bid-strip is-none" data-testid="my-bid-strip" data-state="none">
        You haven't bid yet
      </div>
    );
  }
  return (
    <div className={`my-bid-strip is-${state}`} data-testid="my-bid-strip" data-state={state}>
      <span>
        Your bid <strong>{money(amount)}</strong>
      </span>
      <span className="my-bid-state">{state === 'leading' ? '● Leading' : '▲ Outbid'}</span>
    </div>
  );
}

function QuickBid({ auction, onChanged }: { auction: Auction; onChanged?: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const amount = auction.nextMinBid!;
  const lotUrl = `/auctions/${auction.id}?bid=1`;
  const here = location.pathname + location.search;

  const onBid = () => (user ? setConfirming(true) : navigate(`/login?from=${encodeURIComponent(here)}`));
  const onCustom = () => (user ? navigate(lotUrl) : navigate(`/login?from=${encodeURIComponent(lotUrl)}`));

  const place = async () => {
    setBusy(true);
    try {
      const res = await api<{ event: BidEvent; released: number }>(`/auctions/${auction.id}/bids`, { body: { amount } });
      // crd-003: only locked credit changes on a bid (the top bar's bid limit follows).
      dispatch(bidPlaced({ amount: res.event.bid.amount, released: res.released }));
      toast(`Bid of ${money(amount)} placed on ${auction.name}`, 'success');
    } catch (err) {
      // The server stays the authority (credit, increment, ended, price moved); its message is shown as-is.
      toast(err instanceof ApiError ? (err.fields.amount ?? err.message) : 'The bid could not be placed', 'error');
    } finally {
      setBusy(false);
      setConfirming(false);
      onChanged?.();
    }
  };

  return (
    <div className="lot-actions">
      <button type="button" className="btn btn-primary" onClick={onBid} data-testid="quick-bid">
        Bid {money(amount)}
      </button>
      <button type="button" className="btn btn-steel" onClick={onCustom} data-testid="custom-bid">
        Custom bid
      </button>
      {confirming && (
        <ConfirmDialog title="Place bid" confirmLabel={`Bid ${money(amount)}`} busy={busy} onConfirm={place} onCancel={() => setConfirming(false)} testId="quick-bid-dialog">
          Place a binding bid of <strong>{money(amount)}</strong> on {auction.name}?
        </ConfirmDialog>
      )}
    </div>
  );
}
