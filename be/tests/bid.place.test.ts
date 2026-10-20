import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

const credit = async (agent: request.Agent) => (await agent.get('/api/credit')).body;

describe('bid-001 make a bid', () => {
  beforeEach(resetDb);

  it('places a valid bid that becomes the highest, holding the bidder credit', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { initialPrice: 100 });

    const res = await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    expect(res.status).toBe(201);
    const view = (await request(app).get(`/api/auctions/${a.id}`)).body.auction;
    expect(view).toMatchObject({ currentPrice: 100, bidCount: 1, nextMinBid: 105 });
    expect(await credit(bob)).toMatchObject({ balance: 1000, held: 100, available: 900 });
  });

  it('rejects bids below the minimum increment and equal to the current bid', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { initialPrice: 100 });

    expect((await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 99 })).body.error).toBe('Bid must be at least $100.00');
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    const equal = await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    expect(equal.status).toBe(400);
    expect(equal.body.fields.amount).toBe('Bid must be at least $105.00');
    expect((await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 104.99 })).status).toBe(400);
  });

  it('outbidding releases the previous leader hold', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { initialPrice: 100 });

    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    expect((await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 150 })).status).toBe(201);
    expect(await credit(bob)).toMatchObject({ held: 0, available: 1000 });
    expect(await credit(carol)).toMatchObject({ held: 150, available: 350 });

    const bids = (await request(app).get(`/api/auctions/${a.id}/bids`)).body.bids;
    expect(bids.map((b: { bidder: { username: string }; status: string }) => [b.bidder.username, b.status])).toEqual([
      ['carol', 'active'],
      ['bob', 'outbid'],
    ]);
  });

  it('a leader raising their own bid holds only the new amount', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { initialPrice: 100 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 300 });
    expect(await credit(bob)).toMatchObject({ held: 300, available: 700 });
  });

  it('rejects a bid exceeding available credit', async () => {
    const alice = await loginAs('alice');
    const carol = await loginAs('carol'); // 500 credit
    const a = await createAuction(alice, { initialPrice: 100 });
    const res = await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 600 });
    expect(res.status).toBe(400);
    expect(res.body.fields.amount).toBe('Bid exceeds your available credit');
    expect(await prisma.bidTicket.count()).toBe(0);
    expect(await credit(carol)).toMatchObject({ held: 0, available: 500 });
  });

  it('the seller cannot bid on their own auction', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice);
    const res = await alice.post(`/api/auctions/${a.id}/bids`).send({ amount: 500 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You cannot bid on your own auction');
  });

  it('rejects bids on ended, cancelled and upcoming auctions, and anonymous bids', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const ended = await createAuction(alice);
    await prisma.auction.update({ where: { id: BigInt(ended.id) }, data: { endTime: new Date(Date.now() - 1000) } });
    expect((await bob.post(`/api/auctions/${ended.id}/bids`).send({ amount: 500 })).body.error).toBe('This auction has ended');

    const cancelled = await createAuction(alice);
    await prisma.auction.update({ where: { id: BigInt(cancelled.id) }, data: { status: 'cancelled' } });
    expect((await bob.post(`/api/auctions/${cancelled.id}/bids`).send({ amount: 500 })).body.error).toBe('This auction has been cancelled');

    const upcoming = await createAuction(alice, { startTime: inMinutes(30), endTime: inMinutes(90) });
    expect((await bob.post(`/api/auctions/${upcoming.id}/bids`).send({ amount: 500 })).body.error).toBe('This auction has not started yet');

    expect((await request(app).post(`/api/auctions/${upcoming.id}/bids`).send({ amount: 500 })).status).toBe(401);
  });

  it('concurrent equal bids: exactly one wins', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { initialPrice: 100 });
    const results = await Promise.all([
      bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 200 }),
      carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 200 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const held = (await credit(bob)).held + (await credit(carol)).held;
    expect(held).toBe(200);
  });
});
