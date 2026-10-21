import request from 'supertest';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { nextMinBid } from '../src/lib/auctions';
import { ladderIncrement } from '../src/lib/increments';
import { app, createAuction, loginAs, resetDb, topUp } from './helpers';

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
    [100.0, 10],
    [500.0, 10],
    [999.99, 10],
    [1000.0, 100],
    [5000.0, 100],
  ])('increment at %d is %d', (price, inc) => {
    expect(ladderIncrement(price).toNumber()).toBe(inc);
  });

  it('next minimum bid is the initial price without bids, else current price plus the ladder step', async () => {
    expect((await nextMinBid({ initialPrice: D(9.5), currentPrice: null })).toNumber()).toBe(9.5);
    expect((await nextMinBid({ initialPrice: D(1), currentPrice: D(9.5) })).toNumber()).toBe(10);
    expect((await nextMinBid({ initialPrice: D(1), currentPrice: D(10) })).toNumber()).toBe(11);
  });

  describe('API', () => {
    beforeEach(resetDb);

    it('there is no per-auction min increment: a sent value is ignored and bids step by the ladder', async () => {
      const alice = await loginAs('alice');
      const bob = await loginAs('bob');
      const a = await createAuction(alice, { initialPrice: 100, minIncrement: 50 });
      expect(a).not.toHaveProperty('minIncrement');
      expect((await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 })).status).toBe(201);
      expect((await request(app).get(`/api/auctions/${a.id}`)).body.auction.nextMinBid).toBe(110);
    });

    it('bid-004: from $100 the step is $10, from $1000 it is $100', async () => {
      const alice = await loginAs('alice');
      const bob = await loginAs('bob');
      await topUp(bob, 5000);
      const a = await createAuction(alice, { initialPrice: 100 });
      const next = async () => (await request(app).get(`/api/auctions/${a.id}`)).body.auction.nextMinBid;
      expect((await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 })).status).toBe(201);
      expect(await next()).toBe(110);
      expect((await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 990 })).status).toBe(201);
      expect(await next()).toBe(1000);
      expect((await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 1000 })).status).toBe(201);
      expect(await next()).toBe(1100);
      const low = await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 1099.99 });
      expect(low.status).toBe(400);
      expect(low.body.fields.amount).toBe('Bid must be at least $1100.00');
    });

    it('seeds BID_INCREMENT_RULES with the ladder', async () => {
      const rules = await prisma.bidIncrementRule.findMany({ orderBy: { minBidAmount: 'asc' } });
      expect(rules.map((r) => [r.minBidAmount.toNumber(), r.maxBidAmount?.toNumber() ?? null, r.incrementAmount.toNumber()])).toEqual([
        [0, 1, 0.05], [1, 10, 0.5], [10, 50, 1], [50, 100, 2.5], [100, 1000, 10], [1000, null, 100],
      ]);
    });

    it('at $9.50 a $9.99 bid is rejected naming $10.00, and $10.00 is accepted', async () => {
      const alice = await loginAs('alice');
      const bob = await loginAs('bob');
      const carol = await loginAs('carol');
      const a = await createAuction(alice, { initialPrice: 9.5 });
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
      const a = await createAuction(alice, { initialPrice: 10 });
      await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 10 });

      const low = await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 10.5 });
      expect(low.status).toBe(400);
      expect(low.body.fields.amount).toBe('Bid must be at least $11.00');
      expect((await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 11 })).status).toBe(201);
    });
  });
});
