import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

const BASE = '/api/staff/manage/auctions';
const money = async (username: string) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { username } });
  return { balance: u.creditBalance.toNumber(), held: u.heldBalance.toNumber() };
};

beforeAll(() => {
  process.env.SETTLE_ON_REQUEST = '0';
});
afterAll(() => {
  delete process.env.SETTLE_ON_REQUEST;
});

describe('stf-006 staff soft-delete auctions', () => {
  beforeEach(resetDb);

  it('deleting an active auction with bids keeps the row, cancels tickets, releases every hold, and hides it', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { name: 'Doomed Lamp', initialPrice: 100 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 150 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 200 });
    const bobBefore = await money('bob');
    expect(bobBefore.held).toBe(200);

    const staff = await loginAs('staff');
    const res = await staff.delete(`${BASE}/${a.id}`);
    expect(res.status).toBe(200);

    const row = await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(a.id) } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.status).toBe('cancelled');
    const tickets = await prisma.bidTicket.findMany({ where: { auctionId: BigInt(a.id) } });
    expect(tickets.every((t) => t.status === 'cancelled')).toBe(true);
    expect(await money('bob')).toEqual({ balance: bobBefore.balance, held: 0 });
    expect((await money('carol')).held).toBe(0);
    const release = await prisma.creditTransaction.findFirstOrThrow({
      where: { auctionId: BigInt(a.id), transactionType: 'release', user: { username: 'bob' } },
      orderBy: { id: 'desc' },
    });
    expect(release.description).toBe('Auction deleted by staff: Doomed Lamp');
    expect(release.amount.toNumber()).toBe(200);

    // Gone from public pages and customer lists; the staff list keeps it under Deleted.
    expect((await request(app).get('/api/auctions')).body.auctions.map((x: { id: number }) => x.id)).not.toContain(a.id);
    expect((await request(app).get('/api/auctions?q=Doomed')).body.auctions).toEqual([]);
    expect((await bob.get(`/api/auctions/${a.id}`)).status).toBe(404);
    expect((await alice.get('/api/me/auctions')).body.auctions.map((x: { id: number }) => x.id)).not.toContain(a.id);
    expect((await bob.get('/api/me/bids')).body.items).toEqual([]);
    expect((await staff.get(`${BASE}?status=deleted`)).body.auctions.map((x: { id: number }) => x.id)).toEqual([a.id]);
    expect((await staff.get(BASE)).body.auctions.map((x: { id: number }) => x.id)).not.toContain(a.id);
    // Bids on it are refused; deleting again is 404.
    expect((await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 500 })).status).toBeGreaterThanOrEqual(400);
    expect((await staff.delete(`${BASE}/${a.id}`)).status).toBe(404);
    // The goods are free again.
    const goods = await prisma.goods.findUniqueOrThrow({ where: { id: row.goodsId } });
    expect((await alice.get('/api/me/goods?status=available')).body.goods.map((g: { id: number }) => BigInt(g.id))).toContain(goods.id);
  });

  it('deleting an upcoming auction without bids just hides it', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice, { name: 'Future Lamp', startTime: inMinutes(60) });
    const staff = await loginAs('staff');
    expect((await staff.delete(`${BASE}/${a.id}`)).status).toBe(200);
    expect(await prisma.creditTransaction.count({ where: { auctionId: BigInt(a.id) } })).toBe(0);
    expect((await alice.get(`/api/auctions/${a.id}`)).status).toBe(404);
  });

  it('deleting an ended auction only hides it: settled first if needed, no money moves afterwards', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { name: 'Sold Lamp', initialPrice: 100 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    await prisma.auction.update({ where: { id: BigInt(a.id) }, data: { endTime: new Date(Date.now() - 1000) } });

    const staff = await loginAs('staff');
    expect((await staff.delete(`${BASE}/${a.id}`)).status).toBe(200);
    const row = await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(a.id) } });
    expect(row).toMatchObject({ status: 'ended' });
    expect(row.deletedAt).not.toBeNull();
    expect(row.winnerId).toBe((await prisma.user.findUniqueOrThrow({ where: { username: 'bob' } })).id);
    expect(await money('bob')).toEqual({ balance: 900, held: 0 }); // paid once, nothing reversed
    expect(await prisma.creditTransaction.count({ where: { auctionId: BigInt(a.id), transactionType: 'release' } })).toBe(0);
  });
});
