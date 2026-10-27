import { describe, expect, it } from 'vitest';
import { ENDING_SOON_MS, isEndingSoon, priceLabel, stripState } from './auctionCardState';

const now = Date.parse('2026-10-23T12:00:00.000Z');
const base = {
  status: 'active' as const,
  currentPrice: null as number | null,
  winner: null as { id: number; username: string } | null,
  endTime: new Date(now + 2 * ENDING_SOON_MS).toISOString(),
  isOwner: false,
  myBid: null as { amount: number; status: 'leading' | 'outbid' } | null,
};

describe('ui-1a.1 priceLabel', () => {
  it('says Starting at without bids and Highest bid with bids', () => {
    expect(priceLabel(base)).toBe('Starting at');
    expect(priceLabel({ ...base, currentPrice: 120 })).toBe('Highest bid');
    expect(priceLabel({ ...base, status: 'upcoming' })).toBe('Starting at');
  });

  it('home-2.2: says Winning bid with a winner and Final price without one once ended', () => {
    expect(priceLabel({ ...base, status: 'ended', currentPrice: 120, winner: { id: 1, username: 'bob' } })).toBe('Winning bid');
    expect(priceLabel({ ...base, status: 'ended', currentPrice: 120 })).toBe('Final price');
  });
});

describe('ui-1a.1 isEndingSoon', () => {
  it('is true only for active auctions with under an hour left', () => {
    expect(isEndingSoon({ ...base, endTime: new Date(now + ENDING_SOON_MS - 1000).toISOString() }, now)).toBe(true);
    expect(isEndingSoon({ ...base, endTime: new Date(now + ENDING_SOON_MS).toISOString() }, now)).toBe(false);
    expect(isEndingSoon({ ...base, endTime: new Date(now - 1000).toISOString() }, now)).toBe(false);
    expect(isEndingSoon({ ...base, status: 'upcoming', endTime: new Date(now + 1000).toISOString() }, now)).toBe(false);
  });
});

describe('ui-1a.1 stripState', () => {
  it('is hidden for guests, sellers and auctions that are not live', () => {
    expect(stripState(base, false)).toBeNull();
    expect(stripState({ ...base, isOwner: true }, true)).toBeNull();
    for (const status of ['upcoming', 'ended', 'cancelled'] as const) expect(stripState({ ...base, status }, true)).toBeNull();
  });

  it('follows the viewer\'s own bid, or none', () => {
    expect(stripState(base, true)).toBe('none');
    expect(stripState({ ...base, myBid: { amount: 100, status: 'leading' } }, true)).toBe('leading');
    expect(stripState({ ...base, myBid: { amount: 100, status: 'outbid' } }, true)).toBe('outbid');
  });
});
