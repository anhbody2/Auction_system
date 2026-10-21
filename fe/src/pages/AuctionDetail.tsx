import { useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CONDITION_LABELS, money } from '../api';
import { Countdown, StatusBadge } from '../components/AuctionBits';
import { BidHistory, BidPanel } from '../components/BidPanel';
import { CancelAuction } from '../components/CancelAuction';
import { Messages } from '../components/Messages';
import { useAppDispatch, useAppSelector } from '../store';
import { loadAuction } from '../store/auctionSlice';
import { useAuctionEvents } from '../store/useAuctionEvents';

export function AuctionDetailPage() {
  const auctionId = Number(useParams().id);
  const dispatch = useAppDispatch();
  // rt-001: auction and bids live in the Redux store; pushed bid events update it in place.
  const { auction: loaded, bids: storedBids, error: loadError, requestedId } = useAppSelector((s) => s.auction);
  const current = requestedId === auctionId && loaded?.id === auctionId;
  const auction = current ? loaded : null;
  const bids = current ? storedBids : [];
  const error = requestedId === auctionId ? loadError : '';

  const load = useCallback(() => {
    dispatch(loadAuction(auctionId));
  }, [dispatch, auctionId]);

  useEffect(() => {
    load();
  }, [load]);
  useAuctionEvents(Number.isFinite(auctionId) ? auctionId : null);

  if (error && !auction) return <p className="error">{error}</p>;
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
        <Messages auctionId={auction.id} sellerId={auction.seller.id} closed={auction.status === 'ended' || auction.status === 'cancelled'} onClosed={load} />
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
          <dd data-testid="end-time">{new Date(auction.endTime).toLocaleString()}</dd>
          {auction.winner && (
            <>
              <dt>Winner</dt>
              <dd data-testid="winner">{auction.winner.username}</dd>
            </>
          )}
        </dl>
        <BidPanel auction={auction} bids={bids} onReload={load} />
        <CancelAuction auction={auction} onDone={load} />
      </aside>
    </div>
  );
}
