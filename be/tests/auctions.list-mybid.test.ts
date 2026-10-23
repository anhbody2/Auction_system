import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, createAuction, loginAs, resetDb } from './helpers';

type Listed = { id: number; myBid: { amount: number; status: string } | null };
const listed = async (agent: { get: (url: string) => request.Test }, id: number) =>
  ((await agent.get('/api/auctions')).body.auctions as Listed[]).find((a) => a.id === id)!;

describe('ui-1a.1 the viewer\'s own bid on the auction list', () => {
  let id: number;
  let untouched: number;
  beforeAll(async () => {
    await resetDb();
    const alice = await loginAs('alice');
    id = (await createAuction(alice, { name: 'Strip lamp', initialPrice: 100 })).id;
    untouched = (await createAuction(alice, { name: 'Untouched lamp' })).id;
  });

  it('guests get myBid null on every auction', async () => {
    const res = await request(app).get('/api/auctions');
    expect(res.status).toBe(200);
    expect(res.body.auctions.length).toBeGreaterThan(1);
    for (const a of res.body.auctions) expect(a.myBid).toBeNull();
  });

  it('the leader sees leading with their amount; null where they have not bid', async () => {
    const bob = await loginAs('bob');
    expect((await bob.post(`/api/auctions/${id}/bids`).send({ amount: 100 })).status).toBe(201);
    expect((await listed(bob, id)).myBid).toEqual({ amount: 100, status: 'leading' });
    expect((await listed(bob, untouched)).myBid).toBeNull();
  });

  it('after another bid the first bidder sees outbid and the new leader leading', async () => {
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    expect((await carol.post(`/api/auctions/${id}/bids`).send({ amount: 110 })).status).toBe(201);
    expect((await listed(bob, id)).myBid).toEqual({ amount: 100, status: 'outbid' });
    expect((await listed(carol, id)).myBid).toEqual({ amount: 110, status: 'leading' });
    // bob's latest amount is shown once he bids again and leads.
    expect((await bob.post(`/api/auctions/${id}/bids`).send({ amount: 120 })).status).toBe(201);
    expect((await listed(bob, id)).myBid).toEqual({ amount: 120, status: 'leading' });
  });

  it('the seller gets null on their own auction', async () => {
    const alice = await loginAs('alice');
    expect((await listed(alice, id)).myBid).toBeNull();
  });

  it('search results carry myBid too', async () => {
    const bob = await loginAs('bob');
    const res = await bob.get('/api/auctions?q=Strip&field=auction');
    expect(res.body.auctions).toEqual([expect.objectContaining({ id, myBid: { amount: 120, status: 'leading' } })]);
  });
});
