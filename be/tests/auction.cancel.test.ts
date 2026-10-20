import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, loginAs, resetDb } from './helpers';

describe('sell-002 cancel auction', () => {
  beforeEach(resetDb);

  it('seller cancels; bids are then rejected and held credit is released', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { initialPrice: 100 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 200 });
    expect((await carol.get('/api/credit')).body.held).toBe(200);

    const res = await alice.post(`/api/auctions/${a.id}/cancel`);
    expect(res.status).toBe(200);
    expect((await request(app).get(`/api/auctions/${a.id}`)).body.auction.status).toBe('cancelled');

    const late = await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 500 });
    expect(late.status).toBe(400);
    expect(late.body.error).toBe('This auction has been cancelled');

    expect((await carol.get('/api/credit')).body).toMatchObject({ held: 0, available: 500 });
    expect((await bob.get('/api/credit')).body).toMatchObject({ held: 0, available: 1000 });
    const statuses = await prisma.bidTicket.findMany({ where: { auctionId: BigInt(a.id) }, select: { status: true } });
    expect(statuses.every((t) => t.status === 'cancelled')).toBe(true);
    const release = (await carol.get('/api/credit')).body.transactions[0];
    expect(release).toMatchObject({ transactionType: 'release', amount: 200 });
  });

  it('non-owners cannot cancel', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice);
    const res = await bob.post(`/api/auctions/${a.id}/cancel`);
    expect(res.status).toBe(403);
    expect((await request(app).get(`/api/auctions/${a.id}`)).body.auction.status).toBe('active');
  });

  it('ended or already-cancelled auctions cannot be cancelled', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice);
    await alice.post(`/api/auctions/${a.id}/cancel`);
    expect((await alice.post(`/api/auctions/${a.id}/cancel`)).status).toBe(400);

    const b = await createAuction(alice);
    await prisma.auction.update({ where: { id: BigInt(b.id) }, data: { endTime: new Date(Date.now() - 1000) } });
    expect((await alice.post(`/api/auctions/${b.id}/cancel`)).body.error).toBe('An auction that has ended cannot be cancelled');
  });
});
