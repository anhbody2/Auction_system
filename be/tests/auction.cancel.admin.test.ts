import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

const held = async (agent: request.Agent) => (await agent.get('/api/credit')).body.held as number;

describe('sell-005 admin cancel', () => {
  beforeEach(resetDb);

  it('an admin cancels an active auction with bids: tickets cancelled, holds released, ledger rows written', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const admin = await loginAs('admin');
    const a = await createAuction(alice, { name: 'Brass Clock', initialPrice: 100 });
    const bobBefore = await held(bob);
    const carolBefore = await held(carol);
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 110 }); // raises own bid
    await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 200 });
    expect(await held(carol)).toBe(carolBefore + 200);

    const res = await admin.post(`/api/auctions/${a.id}/cancel`);
    expect(res.status).toBe(200);
    expect((await request(app).get(`/api/auctions/${a.id}`)).body.auction.status).toBe('cancelled');

    const tickets = await prisma.bidTicket.findMany({ where: { auctionId: BigInt(a.id) }, select: { status: true } });
    expect(tickets).toHaveLength(3);
    expect(tickets.every((t) => t.status === 'cancelled')).toBe(true);
    expect(await held(bob)).toBe(bobBefore);
    expect(await held(carol)).toBe(carolBefore);

    const release = (await carol.get('/api/credit')).body.transactions[0];
    expect(release).toMatchObject({ transactionType: 'release', amount: 200, description: 'Auction cancelled: Brass Clock' });
  });

  it('an admin can also cancel an upcoming auction', async () => {
    const alice = await loginAs('alice');
    const admin = await loginAs('admin');
    const a = await createAuction(alice, { startTime: inMinutes(60), duration: { value: 1, unit: 'hours' } });
    expect((await admin.post(`/api/auctions/${a.id}/cancel`)).status).toBe(200);
    expect((await request(app).get(`/api/auctions/${a.id}`)).body.auction.status).toBe('cancelled');
  });

  it('an admin cannot cancel an ended or already cancelled auction', async () => {
    const alice = await loginAs('alice');
    const admin = await loginAs('admin');
    const a = await createAuction(alice);
    expect((await admin.post(`/api/auctions/${a.id}/cancel`)).status).toBe(200);
    const again = await admin.post(`/api/auctions/${a.id}/cancel`);
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('This auction is already cancelled');

    const b = await createAuction(alice);
    await prisma.auction.update({ where: { id: BigInt(b.id) }, data: { endTime: new Date(Date.now() - 1000) } });
    const ended = await admin.post(`/api/auctions/${b.id}/cancel`);
    expect(ended.status).toBe(400);
    expect(ended.body.error).toBe('An auction that has ended cannot be cancelled');
  });
});
