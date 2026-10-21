import { describe, expect, it } from 'vitest';
import type { Auction, Bid, BidEvent } from '../api';
import { auctionReducer, bidReceived, initialState, loadAuction, type AuctionState } from './auctionSlice';

const auction = (over: Partial<Auction> = {}): Auction => ({
  id: 7,
  name: 'Brass Clock',
  description: null,
  seller: { id: 1, username: 'alice' },
  isOwner: false,
  goods: { id: 3, name: 'Brass Clock', condition: null, category: null, images: [] },
  initialPrice: 100,
  hasReserve: false,
  reserveMet: true,
  currentPrice: 100,
  nextMinBid: 110,
  bidCount: 1,
  startTime: '2026-10-21T00:00:00.000Z',
  endTime: '2026-10-22T00:00:00.000Z',
  durationMinutes: 1440,
  status: 'active',
  winner: null,
  cancelledAt: null,
  closedAt: null,
  createdAt: '2026-10-21T00:00:00.000Z',
  ...over,
});

const bid = (id: number, amount: number, username: string, status = 'active'): Bid => ({
  id,
  amount,
  status,
  createdAt: '2026-10-21T01:00:00.000Z',
  bidder: { id: username === 'bob' ? 2 : 3, username },
});

const loaded = (): AuctionState => ({ ...initialState, requestedId: 7, auction: auction(), bids: [bid(10, 100, 'bob')] });

const event = (over: Partial<BidEvent> = {}): BidEvent => ({
  auctionId: 7,
  bid: { ...bid(11, 110, 'carol'), status: 'active' },
  outbidBidIds: [10],
  currentPrice: 110,
  nextMinBid: 120,
  bidCount: 2,
  reserveMet: true,
  ...over,
});

describe('auctionSlice bidReceived', () => {
  it('updates price, next minimum and bid count, and puts the bid at the top of the history', () => {
    const state = auctionReducer(loaded(), bidReceived(event()));
    expect(state.auction).toMatchObject({ currentPrice: 110, nextMinBid: 120, bidCount: 2 });
    expect(state.bids.map((b) => b.id)).toEqual([11, 10]);
    expect(state.bids[0]).toMatchObject({ status: 'active', bidder: { username: 'carol' } });
    expect(state.bids[1].status).toBe('outbid');
  });

  it('ignores a duplicate event (same bid id)', () => {
    const once = auctionReducer(loaded(), bidReceived(event()));
    const twice = auctionReducer(once, bidReceived(event({ bidCount: 99 })));
    expect(twice).toBe(once);
    expect(twice.bids).toHaveLength(2);
    expect(twice.auction?.bidCount).toBe(2);
  });

  it('ignores an event for a different auction', () => {
    const before = loaded();
    const after = auctionReducer(before, bidReceived(event({ auctionId: 8 })));
    expect(after).toBe(before);
    expect(after.auction).toMatchObject({ currentPrice: 100, nextMinBid: 110, bidCount: 1 });
  });

  it('ignores events before an auction is loaded', () => {
    expect(auctionReducer(initialState, bidReceived(event()))).toBe(initialState);
  });

  it('applies the reserve flag from the event', () => {
    const start = loaded();
    start.auction = auction({ hasReserve: true, reserveMet: false });
    expect(auctionReducer(start, bidReceived(event({ reserveMet: true }))).auction?.reserveMet).toBe(true);
  });
});

describe('auctionSlice loadAuction', () => {
  const fulfilled = (id: number, a: Auction, bids: Bid[]) => loadAuction.fulfilled({ auction: a, bids }, 'req', id);

  it('a reload keeps the current data until the response arrives', () => {
    const pending = auctionReducer(loaded(), loadAuction.pending('req', 7));
    expect(pending.auction?.id).toBe(7);
    expect(pending.loading).toBe(true);
    const done = auctionReducer(pending, fulfilled(7, auction({ currentPrice: 150 }), []));
    expect(done.auction?.currentPrice).toBe(150);
    expect(done.loading).toBe(false);
  });

  it('opening another auction clears the old one, and a late response for the old one is dropped', () => {
    const switched = auctionReducer(loaded(), loadAuction.pending('req', 8));
    expect(switched.auction).toBeNull();
    expect(switched.requestedId).toBe(8);
    const late = auctionReducer(switched, fulfilled(7, auction(), []));
    expect(late.auction).toBeNull();
  });

  it('a failed load records the error', () => {
    const pending = auctionReducer(initialState, loadAuction.pending('req', 7));
    const failed = auctionReducer(pending, loadAuction.rejected(null, 'req', 7, 'Auction not found'));
    expect(failed.error).toBe('Auction not found');
    expect(failed.loading).toBe(false);
  });
});
