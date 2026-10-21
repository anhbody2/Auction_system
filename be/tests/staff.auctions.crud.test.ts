import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { createAuction, createGoodsFor, inMinutes, loginAs, resetDb } from './helpers';

const BASE = '/api/staff/manage/auctions';
const terms = (goodsId: number | bigint, overrides: Record<string, unknown> = {}) => ({
  seller: 'alice',
  goodsId: Number(goodsId),
  name: 'Staff Made Lamp',
  description: 'An auction set up by staff for alice.',
  initialPrice: 50,
  startTime: inMinutes(60),
  duration: { value: 2, unit: 'hours' },
  ...overrides,
});

describe('stf-006 staff add, view and edit auctions', () => {
  beforeEach(resetDb);

  it('creates an auction for a seller from their approved, available goods: upcoming with the New tag', async () => {
    const alice = await loginAs('alice');
    const goods = await createGoodsFor(alice, { name: 'Staff Lamp' });
    const staff = await loginAs('staff');
    expect((await staff.get(`${BASE}/seller-goods?seller=alice`)).body.goods.map((g: { name: string }) => g.name)).toEqual(['Staff Lamp']);

    const res = await staff.post(BASE).send(terms(goods.id));
    expect(res.status).toBe(201);
    expect(res.body.auction).toMatchObject({ name: 'Staff Made Lamp', status: 'upcoming', isNew: true, seller: { username: 'alice' } });
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(res.body.auction.id) } })).sellerId).toBe(goods.sellerId);
    // The goods are now in an auction: not offered again.
    expect((await staff.get(`${BASE}/seller-goods?seller=alice`)).body.goods).toEqual([]);
  });

  it('unapproved, busy, sold or someone else\'s goods are 400', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const staff = await loginAs('staff');
    const pending = await createGoodsFor(alice, { name: 'Pending Lamp' });
    await prisma.goods.update({ where: { id: pending.id }, data: { status: 'pending' } });
    const rejected = await createGoodsFor(alice, { name: 'Rejected Lamp' });
    await prisma.goods.update({ where: { id: rejected.id }, data: { status: 'rejected' } });
    const busy = await createGoodsFor(alice, { name: 'Busy Lamp' });
    await createAuction(alice, { goodsId: Number(busy.id) });
    const bobs = await createGoodsFor(bob, { name: 'Bob Lamp' });

    for (const [goods, message] of [
      [pending, 'Goods must be approved before auction'],
      [rejected, 'Goods must be approved before auction'],
      [busy, 'These goods are already in an auction'],
      [bobs, 'These goods do not belong to this seller'],
    ] as const) {
      const res = await staff.post(BASE).send(terms(goods.id));
      expect(res.status, message).toBe(400);
      expect(res.body.fields.goodsId).toBe(message);
    }
    const noSeller = await staff.post(BASE).send(terms(busy.id, { seller: 'nobody' }));
    expect(noSeller.status).toBe(400);
    expect(noSeller.body.fields.seller).toBe('No customer with that username or email');
  });

  it('views an auction with its bids and settlement', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { name: 'Viewed Lamp', reservePrice: 150 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    const staff = await loginAs('staff');
    const res = await staff.get(`${BASE}/${a.id}`);
    expect(res.status).toBe(200);
    expect(res.body.auction).toMatchObject({ name: 'Viewed Lamp', status: 'active', reservePrice: 150, settlement: null, deletedAt: null });
    expect(res.body.bids[0]).toMatchObject({ amount: 100, bidder: { username: 'bob' }, status: 'active' });
    expect((await staff.get(`${BASE}/999999`)).status).toBe(404);
  });

  it('edits an upcoming auction (end time recomputed); a started one only takes a new description', async () => {
    const alice = await loginAs('alice');
    const upcoming = await createAuction(alice, { name: 'Later Lamp', startTime: inMinutes(60) });
    const staff = await loginAs('staff');
    const start = new Date(Date.now() + 2 * 3600_000);
    const ok = await staff.patch(`${BASE}/${upcoming.id}`).send({
      name: 'Later Lamp v2',
      initialPrice: 75,
      reservePrice: 100,
      startTime: start.toISOString(),
      duration: { value: 3, unit: 'hours' },
    });
    expect(ok.status).toBe(200);
    const row = await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(upcoming.id) } });
    expect(row).toMatchObject({ name: 'Later Lamp v2', durationMinutes: 180 });
    expect(row.initialPrice.toNumber()).toBe(75);
    expect(row.endTime.getTime() - row.startTime.getTime()).toBe(3 * 3600_000);
    expect(Math.abs(row.startTime.getTime() - start.getTime())).toBeLessThan(1000);

    const badReserve = await staff.patch(`${BASE}/${upcoming.id}`).send({ reservePrice: 10 });
    expect(badReserve.status).toBe(400);
    expect(badReserve.body.fields.reservePrice).toBe('Reserve price cannot be below the starting price');
    expect((await staff.patch(`${BASE}/${upcoming.id}`).send({ duration: { value: 31, unit: 'days' } })).status).toBe(400);
    expect((await staff.patch(`${BASE}/${upcoming.id}`).send({ sellerId: 1 })).status).toBe(400);

    const active = await createAuction(alice, { name: 'Running Lamp' });
    for (const body of [{ initialPrice: 5 }, { startTime: inMinutes(30) }, { name: 'Renamed' }]) {
      const res = await staff.patch(`${BASE}/${active.id}`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Only the description can be changed once the auction has started');
    }
    const desc = await staff.patch(`${BASE}/${active.id}`).send({ description: 'Corrected description by staff.' });
    expect(desc.status).toBe(200);
    expect(desc.body.auction.description).toBe('Corrected description by staff.');
  });
});
