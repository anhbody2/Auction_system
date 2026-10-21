import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from './index';
import { auctionFinished, bidPlaced, creditLoaded, creditReducer, initialCreditState, outbid } from './creditSlice';

const loaded = creditReducer(initialCreditState, creditLoaded({ credit: 1000, locked: 0 }));

describe('creditSlice', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a bid raises locked only; credit stays', () => {
    const state = creditReducer(loaded, bidPlaced({ amount: 100, released: 0 }));
    expect(state).toEqual({ credit: 1000, locked: 100 });
  });

  it('raising your own bid locks only the difference', () => {
    const first = creditReducer(loaded, bidPlaced({ amount: 100, released: 0 }));
    expect(creditReducer(first, bidPlaced({ amount: 110.5, released: 100 }))).toEqual({ credit: 1000, locked: 110.5 });
  });

  it('being outbid lowers locked only; credit stays', () => {
    const bid = creditReducer(loaded, bidPlaced({ amount: 100, released: 0 }));
    expect(creditReducer(bid, outbid({ amount: 100 }))).toEqual({ credit: 1000, locked: 0 });
  });

  it('works in cents and never goes below zero', () => {
    const odd = creditReducer(loaded, bidPlaced({ amount: 0.1, released: 0 }));
    const twice = creditReducer(odd, bidPlaced({ amount: 0.2, released: 0 }));
    expect(twice.locked).toBe(0.3);
    expect(creditReducer(twice, outbid({ amount: 5 })).locked).toBe(0);
  });

  it('does nothing before credit is loaded', () => {
    expect(creditReducer(initialCreditState, bidPlaced({ amount: 100, released: 0 }))).toEqual(initialCreditState);
    expect(creditReducer(initialCreditState, outbid({ amount: 100 }))).toEqual(initialCreditState);
  });

  it("'auction finished' fetches credit again and stores both figures", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ balance: 890, held: 0, transactions: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();
    store.dispatch(creditLoaded({ credit: 1000, locked: 110 }));

    await store.dispatch(auctionFinished({ auctionId: 7 }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/credit');
    expect(store.getState().credit).toEqual({ credit: 890, locked: 0 });
  });

  it('bids and outbids make no request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();
    store.dispatch(creditLoaded({ credit: 1000, locked: 0 }));
    store.dispatch(bidPlaced({ amount: 100, released: 0 }));
    store.dispatch(outbid({ amount: 100 }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
