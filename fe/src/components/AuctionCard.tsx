import { Link, useNavigate } from 'react-router-dom';
import { money, type Auction } from '../api';
import { useAuth } from '../auth';
import { Countdown, NewTag, useNow } from './AuctionBits';
import { isEndingSoon, priceLabel, stripState } from './auctionCardState';
import { Pill } from './ui';

/**
 * ui-1a.1: compact lot card from the 1a Browse mockup, with the viewer's own bid position on live lots.
 * ui-1a.3: live lots also get 'Bid $X' and 'Custom bid', both opening the lot page to bid there.
 */
export function AuctionCard({ auction, onElapsed }: { auction: Auction; onElapsed?: () => void }) {
  const { user } = useAuth();
  const now = useNow();
  const ended = auction.status === 'ended';
  const soon = isEndingSoon(auction, now);
  const strip = stripState(auction, !!user);
  return (
    <article className="lot-card" data-testid={`auction-card-${auction.id}`}>
      <Link to={`/auctions/${auction.id}`} className="card-link lot-body">
        <div className="lot-head">
          {auction.goods.images[0] ? (
            <img src={auction.goods.images[0]} alt="" className="lot-thumb" loading="lazy" />
          ) : (
            <div className="lot-thumb lot-thumb-empty" aria-hidden="true" />
          )}
          <div className="lot-head-text">
            <h3 title={auction.name}>{auction.name}</h3>
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
          </div>
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
        {ended && <div className="small muted">{auction.winner ? `Won by ${auction.winner.username}` : 'No winner'}</div>}
        {strip && <MyBidStrip state={strip} amount={auction.myBid?.amount} />}
      </Link>
      {auction.status === 'active' && !auction.isOwner && auction.nextMinBid != null && <QuickBid auction={auction} />}
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

function QuickBid({ auction }: { auction: Auction }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  // 'Bid $X' opens the lot, whose form is pre-filled with the minimum next bid; 'Custom bid' also focuses it.
  const open = (url: string) => navigate(user ? url : `/login?from=${encodeURIComponent(url)}`);

  return (
    <div className="lot-actions">
      <button type="button" className="lot-action is-bid" onClick={() => open(`/auctions/${auction.id}`)} data-testid="quick-bid">
        Bid {money(auction.nextMinBid)}
      </button>
      <button type="button" className="lot-action is-custom" onClick={() => open(`/auctions/${auction.id}?bid=1`)} data-testid="custom-bid">
        Custom bid
      </button>
    </div>
  );
}
