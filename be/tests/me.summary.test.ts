import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, loginAs, resetDb } from './helpers';

const summary = async (agent: request.Agent) => (await agent.get('/api/me/summary')).body;

describe('ui-2a.1 GET /api/me/summary', () => {
  beforeAll(resetDb);

  it('needs a session', async () => {
    expect((await request(app).get('/api/me/summary')).status).toBe(401);
  });

  it('counts leading bids: up on a bid, same on a raise, down when outbid or the auction is deleted', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const base = (await summary(bob)).leadingBids;
    const a = await createAuction(alice, { name: 'Summary one', initialPrice: 10 });
    const b = await createAuction(alice, { name: 'Summary two', initialPrice: 10 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 10 });
    await bob.post(`/api/auctions/${b.id}/bids`).send({ amount: 10 });
    expect((await summary(bob)).leadingBids).toBe(base + 2);
    // Raising his own bid keeps one leading ticket per auction.
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 11 });
    expect((await summary(bob)).leadingBids).toBe(base + 2);
    await carol.post(`/api/auctions/${b.id}/bids`).send({ amount: 11 });
    expect((await summary(bob)).leadingBids).toBe(base + 1);
    // Staff-deleted auctions do not count.
    await prisma.auction.update({ where: { id: BigInt(a.id) }, data: { deletedAt: new Date() } });
    expect((await summary(bob)).leadingBids).toBe(base);
  });

  it('sums pending top-ups and withdrawals separately; approval clears them', async () => {
    const carol = await loginAs('carol');
    expect(await summary(carol)).toMatchObject({ pendingTopup: 0, pendingWithdraw: 0 });
    await carol.post('/api/credit/topup').send({ amount: 50 });
    const second = await carol.post('/api/credit/topup').send({ amount: 25.5 });
    await carol.post('/api/credit/withdraw').send({ amount: 20 });
    expect(await summary(carol)).toMatchObject({ pendingTopup: 75.5, pendingWithdraw: 20 });
    const staff = await loginAs('staff');
    expect((await staff.post(`/api/staff/credit/requests/${second.body.request.id}/approve`)).status).toBe(200);
    expect(await summary(carol)).toMatchObject({ pendingTopup: 50, pendingWithdraw: 20 });
    // Another user's requests are not included.
    expect(await summary(await loginAs('bob'))).toMatchObject({ pendingTopup: 0, pendingWithdraw: 0 });
  });
});
