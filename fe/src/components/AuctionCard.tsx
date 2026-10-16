import { Link } from 'react-router-dom';
import { money, type Auction } from '../api';
import { Countdown, StatusBadge } from './AuctionBits';

export function AuctionCard({ auction, onElapsed }: { auction: Auction; onElapsed?: () => void }) {
  const ended = auction.status === 'ended';
  return (
    <article className="auction-card" data-testid={`auction-card-${auction.id}`}>
      <Link to={`/auctions/${auction.id}`} className="card-link">
        {auction.goods.images[0] ? (
          <img src={auction.goods.images[0]} alt="" className="card-img" loading="lazy" />
        ) : (
          <div className="card-img placeholder">{auction.goods.category?.name ?? 'Auction'}</div>
        )}
        <div className="card-body">
          <div className="row spread">
            <StatusBadge status={auction.status} />
            <span className="muted small">{auction.goods.category?.name}</span>
          </div>
          <h3>{auction.name}</h3>
          <div className="muted small">by {auction.seller.username}</div>
          <div className="row spread card-price">
            <div>
              <div className="muted small">{ended ? (auction.winner ? 'Sold for' : 'Final') : auction.currentPrice ? 'Current bid' : 'Starting at'}</div>
              <strong>{money(auction.currentPrice ?? auction.initialPrice)}</strong>
            </div>
            <div className="muted small">
              {auction.bidCount} bid{auction.bidCount === 1 ? '' : 's'}
            </div>
          </div>
          <div className="small">
            <Countdown status={auction.status} startTime={auction.startTime} endTime={auction.endTime} onElapsed={onElapsed} />
          </div>
          {ended && <div className="small muted">{auction.winner ? `Won by ${auction.winner.username}` : 'No winner'}</div>}
        </div>
      </Link>
    </article>
  );
}
