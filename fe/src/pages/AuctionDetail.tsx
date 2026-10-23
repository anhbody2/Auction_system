import { useCallback, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CONDITION_LABELS } from '../api';
import { NewTag, StatusBadge } from '../components/AuctionBits';
import { BidHistory, BidPanel } from '../components/BidPanel';
import { CancelAuction } from '../components/CancelAuction';
import { Gallery } from '../components/Gallery';
import { Messages } from '../components/Messages';
import { Pill } from '../components/ui';
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

  const category = auction.goods.category;
  const condition = auction.goods.condition && (CONDITION_LABELS[auction.goods.condition] ?? auction.goods.condition);

  // ui-1b.1: two columns (content | sticky bid aside); on narrow screens the aside follows the gallery.
  return (
    <div className="lot-detail">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Browse</Link>
        {category && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/?category=${category.id}`}>{category.name}</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page">Lot #{auction.id}</span>
      </nav>
      <div className="lot-gallery">
        <Gallery images={auction.goods.images} name={auction.name} />
      </div>
      <aside className="lot-aside">
        <div className="ui-card">
          <BidPanel auction={auction} bids={bids} onReload={load} />
          <CancelAuction auction={auction} onDone={load} />
        </div>
      </aside>
      <div className="lot-main">
        <section className="ui-card lot-info" data-testid="lot-info">
          <div className="lot-pills">
            <StatusBadge status={auction.status} />
            <NewTag status={auction.status} startTime={auction.startTime} />
            {!auction.hasReserve && <Pill tone="muted">No reserve</Pill>}
          </div>
          <h1>{auction.name}</h1>
          <p className="muted small">
            Sold by <strong>{auction.seller.username}</strong>
          </p>
          {auction.description && <p className="lot-description">{auction.description}</p>}
          <dl className="lot-facts" data-testid="lot-facts">
            {condition && (
              <div>
                <dt>Condition</dt>
                <dd>{condition}</dd>
              </div>
            )}
            {category && (
              <div>
                <dt>Category</dt>
                <dd>{category.name}</dd>
              </div>
            )}
            <div>
              <dt>Starts</dt>
              <dd>{new Date(auction.startTime).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Ends</dt>
              <dd data-testid="end-time">{new Date(auction.endTime).toLocaleString()}</dd>
            </div>
            {auction.winner && (
              <div>
                <dt>Winner</dt>
                <dd data-testid="winner">{auction.winner.username}</dd>
              </div>
            )}
          </dl>
        </section>
        <h2>Bid history</h2>
        <BidHistory bids={bids} />
        <Messages auctionId={auction.id} sellerId={auction.seller.id} closed={auction.status === 'ended' || auction.status === 'cancelled'} onClosed={load} />
      </div>
    </div>
  );
}
