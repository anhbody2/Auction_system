import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, createGoodsFor, inMinutes, loginAs, resetDb } from './helpers';
import { attachAuction } from './goods.fixtures';

describe('sell-001 create auction', () => {
  beforeAll(resetDb);

  it('requires login', async () => {
    expect((await request(app).post('/api/auctions').send({})).status).toBe(401);
  });

  it('creates an active auction visible to the seller and to other customers', async () => {
    const alice = await loginAs('alice');
    const created = await createAuction(alice, { reservePrice: 150 });
    expect(created).toMatchObject({ status: 'active', initialPrice: 100, nextMinBid: 100, isOwner: true, reservePrice: 150 });

    const mine = await alice.get('/api/me/auctions');
    expect(mine.body.auctions.map((a: { id: number }) => a.id)).toContain(created.id);

    const bob = await loginAs('bob');
    const seen = await bob.get(`/api/auctions/${created.id}`);
    expect(seen.status).toBe(200);
    expect(seen.body.auction).toMatchObject({ name: 'Vintage camera', isOwner: false, hasReserve: true, reserveMet: false });
    expect(seen.body.auction.reservePrice).toBeUndefined();
    const list = await request(app).get('/api/auctions');
    expect(list.body.auctions.map((a: { id: number }) => a.id)).toContain(created.id);
  });

  it('marks future auctions as upcoming', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice, { startTime: inMinutes(30), duration: { value: 1, unit: 'hours' } });
    expect(a.status).toBe('upcoming');
    expect(a.durationMinutes).toBe(60);
  });

  it('rejects negative price, a duration over 30 days, and missing fields', async () => {
    const alice = await loginAs('alice');
    const res = await alice.post('/api/auctions').send({
      name: '',
      description: 'short',
      goodsId: '',
      initialPrice: -5,
      startTime: inMinutes(60),
      duration: { value: 31, unit: 'days' },
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toMatchObject({
      name: expect.any(String),
      description: expect.any(String),
      goodsId: 'Choose goods to auction',
      initialPrice: 'Starting price must be greater than 0',
      duration: 'Duration must be between 1 hour and 30 days',
    });
  });

  it('rejects reserve below starting price', async () => {
    const alice = await loginAs('alice');
    await expect(createAuction(alice, { initialPrice: 100, reservePrice: 50 })).rejects.toThrow(/Reserve price cannot be below/);
  });

  describe('sell-003 the auction is created from existing goods', () => {
    const terms = (goodsId: unknown) => ({
      goodsId,
      name: 'Clock auction',
      description: 'Auction for a mantel clock in working order.',
      initialPrice: 100,
      startTime: inMinutes(0),
      duration: { value: 1, unit: 'hours' },
    });

    it('links the auction to the chosen goods; goods fields and imageUrl in the body are ignored', async () => {
      const alice = await loginAs('alice');
      const goods = await createGoodsFor(alice, { name: 'Mantel clock', imageUrl: '/uploads/clock.png', condition: 'like_new' });
      const before = await prisma.goods.count();
      const res = await alice.post('/api/auctions').send({ ...terms(Number(goods.id)), imageUrl: '/uploads/other.png', condition: 'new', categoryId: 999 });
      expect(res.status).toBe(201);
      expect(res.body.auction).toMatchObject({
        name: 'Clock auction',
        goods: { id: Number(goods.id), name: 'Mantel clock', condition: 'like_new', images: ['/uploads/clock.png'] },
      });
      expect(await prisma.goods.count()).toBe(before);
      const row = await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(res.body.auction.id) } });
      expect(row.goodsId).toBe(goods.id);
      expect((await alice.get('/api/me/goods')).body.goods.find((g: { id: number }) => g.id === Number(goods.id)).status).toBe('in_auction');
    });

    it("someone else's, deleted or unknown goods are 404", async () => {
      const alice = await loginAs('alice');
      const bob = await loginAs('bob');
      const bobs = await createGoodsFor(bob, { name: 'Bob lamp' });
      expect((await alice.post('/api/auctions').send(terms(Number(bobs.id)))).status).toBe(404);
      const gone = await createGoodsFor(alice, { name: 'Gone lamp' });
      await prisma.goods.update({ where: { id: gone.id }, data: { status: 'deleted' } });
      expect((await alice.post('/api/auctions').send(terms(Number(gone.id)))).status).toBe(404);
      expect((await alice.post('/api/auctions').send(terms(999999))).status).toBe(404);
    });

    it('goods already in an open auction, or sold, are 409; after a cancelled or unsold auction they can go again', async () => {
      const alice = await loginAs('alice');
      const open = await createGoodsFor(alice, { name: 'Open lamp' });
      expect((await alice.post('/api/auctions').send(terms(Number(open.id)))).status).toBe(201);
      const twice = await alice.post('/api/auctions').send(terms(Number(open.id)));
      expect(twice.status).toBe(409);
      expect(twice.body.fields.goodsId).toBe('These goods are already in an auction');

      const sold = await createGoodsFor(alice, { name: 'Sold lamp' });
      await attachAuction(sold.id, 'ended', 'bob');
      const again = await alice.post('/api/auctions').send(terms(Number(sold.id)));
      expect(again.status).toBe(409);
      expect(again.body.fields.goodsId).toBe('These goods have been sold');

      for (const status of ['cancelled', 'ended']) {
        const back = await createGoodsFor(alice, { name: `Back ${status}` });
        await attachAuction(back.id, status);
        expect((await alice.post('/api/auctions').send(terms(Number(back.id)))).status).toBe(201);
      }
    });
  });
});
