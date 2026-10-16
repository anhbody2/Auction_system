import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, CONDITION_LABELS, api, money, type Auction } from '../api';
import { Countdown, StatusBadge } from '../components/AuctionBits';
import { BidHistory, BidPanel, type Bid } from '../components/BidPanel';
import { CancelAuction } from '../components/CancelAuction';
import { Messages } from '../components/Messages';

export function AuctionDetailPage() {
  const { id } = useParams();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [r, b] = await Promise.all([api<{ auction: Auction }>(`/auctions/${id}`), api<{ bids: Bid[] }>(`/auctions/${id}/bids`)]);
      setAuction(r.auction);
      setBids(b.bids);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load auction');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="error">{error}</p>;
  if (!auction) return <p className="muted">Loading...</p>;

  return (
    <div className="detail">
      <div>
        {auction.goods.images[0] ? (
          <img className="hero-img" src={auction.goods.images[0]} alt={auction.name} />
        ) : (
          <div className="hero-img placeholder">No image</div>
        )}
        <h2>Description</h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>{auction.description}</p>
        <h2>Bid history</h2>
        <BidHistory bids={bids} />
        <Messages auctionId={auction.id} sellerId={auction.seller.id} />
      </div>
      <aside className="card">
        <div className="row spread">
          <StatusBadge status={auction.status} />
          <Countdown status={auction.status} startTime={auction.startTime} endTime={auction.endTime} onElapsed={load} />
        </div>
        <h1 style={{ marginTop: '0.75rem' }}>{auction.name}</h1>
        <p className="muted small">
          Sold by <strong>{auction.seller.username}</strong>
          {auction.goods.category && ` · ${auction.goods.category.name}`}
          {auction.goods.condition && ` · ${CONDITION_LABELS[auction.goods.condition] ?? auction.goods.condition}`}
        </p>
        <dl className="facts">
          <dt>{auction.currentPrice ? 'Current bid' : 'Starting price'}</dt>
          <dd className="big" data-testid="current-price">
            {money(auction.currentPrice ?? auction.initialPrice)}
          </dd>
          <dt>Bids</dt>
          <dd data-testid="bid-count">{auction.bidCount}</dd>
          {auction.nextMinBid != null && (
            <>
              <dt>Minimum next bid</dt>
              <dd data-testid="next-min-bid">{money(auction.nextMinBid)}</dd>
            </>
          )}
          {auction.hasReserve && (
            <>
              <dt>Reserve</dt>
              <dd>
                {auction.reservePrice != null && `${money(auction.reservePrice)} · `}
                {auction.reserveMet ? 'met' : 'not met'}
              </dd>
            </>
          )}
          <dt>Starts</dt>
          <dd>{new Date(auction.startTime).toLocaleString()}</dd>
          <dt>Ends</dt>
          <dd>{new Date(auction.endTime).toLocaleString()}</dd>
          {auction.winner && (
            <>
              <dt>Winner</dt>
              <dd data-testid="winner">{auction.winner.username}</dd>
            </>
          )}
        </dl>
        <BidPanel auction={auction} onBid={load} />
        <CancelAuction auction={auction} onDone={load} />
      </aside>
    </div>
  );
}
