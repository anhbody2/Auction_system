import { describe, expect, it } from 'vitest';
import type { Auction } from './api';
import { ENDED_LIMIT, isTab, myAuctionsTabs, type MyBidItem } from './myAuctionsTabs';

const at = (minutes: number) => new Date(Date.parse('2026-10-23T12:00:00.000Z') + minutes * 60_000).toISOString();
let nextId = 1;
const auction = (over: Partial<Auction> = {}) => ({ id: nextId++, name: `Lot ${nextId}`, status: 'active', endTime: at(60), winner: null, ...over }) as Auction;
const bid = (status: MyBidItem['myStatus'], over: Partial<Auction> = {}, amount = 10): MyBidItem => ({
  auction: auction({ status: status === 'won' || status === 'lost' ? 'ended' : status === 'cancelled' ? 'cancelled' : 'active', ...over }),
  myLatestBid: amount,
  myLatestBidAt: at(0),
  myStatus: status,
});

describe('ui-2a.3 myAuctionsTabs', () => {
  it('Bidding has live auctions I lead or was outbid on, in the given order', () => {
    const items = [bid('outbid'), bid('winning'), bid('won'), bid('lost'), bid('cancelled')];
    const { bidding } = myAuctionsTabs(items, []);
    expect(bidding.map((b) => b.myStatus)).toEqual(['outbid', 'winning']);
  });

  it('Selling has my active and upcoming auctions, soonest ending first', () => {
    const mine = [auction({ name: 'late', endTime: at(300) }), auction({ name: 'soon', status: 'upcoming', endTime: at(90) }), auction({ name: 'done', status: 'ended' }), auction({ name: 'off', status: 'cancelled' })];
    expect(myAuctionsTabs([], mine).selling.map((a) => a.name)).toEqual(['soon', 'late']);
  });

  it('Ended mixes both sides newest first with won / lost / sold / unsold', () => {
    const items = [bid('won', { endTime: at(-10) }, 150), bid('lost', { endTime: at(-30) })];
    const mine = [auction({ status: 'ended', endTime: at(-20), winner: { id: 9, username: 'bob' } }), auction({ status: 'ended', endTime: at(-5) })];
    const { ended } = myAuctionsTabs(items, mine);
    expect(ended.map((e) => [e.side, e.result])).toEqual([
      ['seller', 'unsold'],
      ['bidder', 'won'],
      ['seller', 'sold'],
      ['bidder', 'lost'],
    ]);
    expect(ended[1].myBid).toBe(150);
    expect(ended[0].myBid).toBeNull();
  });

  it('keeps only the last ENDED_LIMIT ended auctions', () => {
    const mine = Array.from({ length: ENDED_LIMIT + 3 }, (_, i) => auction({ status: 'ended', endTime: at(-i) }));
    const { ended } = myAuctionsTabs([], mine);
    expect(ended).toHaveLength(ENDED_LIMIT);
    expect(ended[0].auction.endTime).toBe(at(0));
  });

  it('recognises tab names from the URL', () => {
    expect(isTab('selling')).toBe(true);
    expect(isTab('nope')).toBe(false);
    expect(isTab(null)).toBe(false);
  });
});
