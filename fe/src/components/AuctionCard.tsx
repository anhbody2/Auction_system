import { Link } from 'react-router-dom';
import { money, type Auction } from '../api';
import { useAuth } from '../auth';
import { Countdown, NewTag, useNow } from './AuctionBits';
import { isEndingSoon, priceLabel, stripState } from './auctionCardState';
import { Pill } from './ui';

/** ui-1a.1: compact lot card from the 1a Browse mockup, with the viewer's own bid position on live lots. */
export function AuctionCard({ auction, onElapsed }: { auction: Auction; onElapsed?: () => void }) {
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
