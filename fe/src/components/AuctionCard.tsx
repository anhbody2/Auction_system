import { Link, useNavigate } from 'react-router-dom';
import { money, type Auction } from '../api';
import { useAuth } from '../auth';
import { Countdown, NewTag, useNow } from './AuctionBits';
import { isEndingSoon, priceLabel, stripState } from './auctionCardState';
/**
 * ui-1a.1: lot card with the viewer's own bid position on live lots.
 * ui-1a.3: live lots also get 'Bid $X' and 'Custom bid', both opening the lot page to bid there.
 * Product-card layout: big image with the timer overlaid top-right ('Starts in …' before the start, time left once
 * live), name and category under it, price pinned to the bottom above the two buttons.
 */
export function AuctionCard({ auction, onElapsed }: { auction: Auction; onElapsed?: () => void }) {
  const { user } = useAuth();
  const now = useNow();
  const ended = auction.status === 'ended';
  const soon = isEndingSoon(auction, now);
  const strip = stripState(auction, !!user);
  const timerTone = soon ? 'is-soon' : ended || auction.status === 'cancelled' ? 'is-muted' : '';
  return (
    <article className="lot-card" data-testid={`auction-card-${auction.id}`}>
      <Link to={`/auctions/${auction.id}`} className="card-link lot-body">
        <div className="lot-media">
          {auction.goods.images[0] ? (
            <img src={auction.goods.images[0]} alt="" className="lot-image" loading="lazy" />
          ) : (
            <div className="lot-image lot-thumb-empty" aria-hidden="true" />
          )}
          <span className={`lot-timer ${timerTone}`} data-testid={soon ? 'ending-soon' : undefined}>
            <ClockIcon />
            <Countdown status={auction.status} startTime={auction.startTime} endTime={auction.endTime} onElapsed={onElapsed} />
          </span>
          <span className="lot-media-tag">
            <NewTag status={auction.status} startTime={auction.startTime} />
          </span>
        </div>
        <div className="lot-head-text">
          <h3 title={auction.name}>{auction.name}</h3>
          {auction.goods.category && <div className="lot-sub">{auction.goods.category.name}</div>}
        </div>
        <div className="lot-price">
          <div>
            <div className="lot-price-label">{priceLabel(auction)}</div>
            <strong className="lot-price-value">{money(auction.currentPrice ?? auction.initialPrice)}</strong>
          </div>
          <span className="lot-bid-count">
            {auction.bidCount} bid{auction.bidCount === 1 ? '' : 's'}
          </span>
        </div>
        {ended && (
          <div className="small muted" data-testid="card-winner">
            {auction.winner ? `Won by ${auction.winner.username}` : 'No winner'}
          </div>
        )}
        {strip && <MyBidStrip state={strip} amount={auction.myBid?.amount} />}
      </Link>
      {auction.status === 'active' && !auction.isOwner && auction.nextMinBid != null && <QuickBid auction={auction} />}
    </article>
  );
}

function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
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

function QuickBid({ auction }: { auction: Auction }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // 'Bid $X' opens the lot, whose form is pre-filled with the minimum next bid; 'Custom bid' also focuses it.
  const open = (url: string) => navigate(user ? url : `/login?from=${encodeURIComponent(url)}`);

  return (
    <div className="lot-actions">
      <button type="button" className="lot-action is-bid" onClick={() => open(`/auctions/${auction.id}`)} data-testid="quick-bid">
        BID {money(auction.nextMinBid)}
      </button>
      <button type="button" className="lot-action is-custom" onClick={() => open(`/auctions/${auction.id}?bid=1`)} data-testid="custom-bid">
        JOIN IN!
      </button>
    </div>
  );
}
