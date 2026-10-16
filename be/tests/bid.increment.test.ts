import request from 'supertest';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { nextMinBid } from '../src/lib/auctions';
import { ladderIncrement } from '../src/lib/increments';
import { app, createAuction, loginAs, resetDb } from './helpers';

const D = (v: number) => new Prisma.Decimal(v);

describe('bid-003 price-tiered bid increment', () => {
  it.each([
    [0.5, 0.05],
    [1.0, 0.5],
    [9.99, 0.5],
    [10.0, 1],
    [49.99, 1],
    [50.0, 2.5],
    [99.99, 2.5],
    [100.0, 5],
    [999.99, 10],
    [1000.0, 25],
    [5000.0, 100],
  ])('increment at %d is %d', (price, inc) => {
    expect(ladderIncrement(price).toNumber()).toBe(inc);
  });

  it('next minimum bid is the initial price without bids, else current price plus the ladder step', async () => {
    expect((await nextMinBid({ initialPrice: D(9.5), currentPrice: null, minIncrement: null })).toNumber()).toBe(9.5);
    expect((await nextMinBid({ initialPrice: D(1), currentPrice: D(9.5), minIncrement: null })).toNumber()).toBe(10);
    expect((await nextMinBid({ initialPrice: D(1), currentPrice: D(10), minIncrement: null })).toNumber()).toBe(11);
  });

  it('a per-auction min increment can raise the step but not lower it below the ladder', async () => {
    expect((await nextMinBid({ initialPrice: D(1), currentPrice: D(100), minIncrement: D(10) })).toNumber()).toBe(110);
    expect((await nextMinBid({ initialPrice: D(1), currentPrice: D(100), minIncrement: D(1) })).toNumber()).toBe(105);
  });

  describe('API', () => {
    beforeEach(resetDb);

    it('seeds BID_INCREMENT_RULES with the ladder', async () => {
      const rules = await prisma.bidIncrementRule.findMany({ orderBy: { minBidAmount: 'asc' } });
      expect(rules.map((r) => [r.minBidAmount.toNumber(), r.maxBidAmount?.toNumber() ?? null, r.incrementAmount.toNumber()])).toEqual([
        [0, 1, 0.05], [1, 10, 0.5], [10, 50, 1], [50, 100, 2.5], [100, 500, 5], [500, 1000, 10], [1000, 5000, 25], [5000, null, 100],
      ]);
    });

    it('at $9.50 a $9.99 bid is rejected naming $10.00, and $10.00 is accepted', async () => {
      const alice = await loginAs('alice');
      const bob = await loginAs('bob');
      const carol = await loginAs('carol');
      const a = await createAuction(alice, { initialPrice: 9.5, minIncrement: null });
      expect((await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 9.5 })).status).toBe(201);

      const low = await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 9.99 });
      expect(low.status).toBe(400);
      expect(low.body.fields.amount).toBe('Bid must be at least $10.00');
      expect((await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 10 })).status).toBe(201);
      expect((await request(app).get(`/api/auctions/${a.id}`)).body.auction.nextMinBid).toBe(11);
    });

    it('at $10.00 a $10.50 bid is rejected and $11.00 is accepted', async () => {
      const alice = await loginAs('alice');
      const bob = await loginAs('bob');
      const carol = await loginAs('carol');
      const a = await createAuction(alice, { initialPrice: 10, minIncrement: null });
      await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 10 });

      const low = await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 10.5 });
      expect(low.status).toBe(400);
      expect(low.body.fields.amount).toBe('Bid must be at least $11.00');
      expect((await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 11 })).status).toBe(201);
    });
  });
});
