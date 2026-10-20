import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { goodsState } from '../src/lib/goods';
import { app, loginAs, resetDb } from './helpers';
import { uploadTestImage, useTempUploadDir } from './upload.fixtures';

useTempUploadDir();

async function addGoods(agent: request.Agent, name: string) {
  const category = await prisma.category.findFirstOrThrow();
  const res = await agent.post('/api/goods').send({
    name,
    description: 'Goods created by the list tests.',
    categoryId: Number(category.id),
    condition: 'new',
    images: [await uploadTestImage(agent)],
  });
  expect(res.status).toBe(201);
  return BigInt(res.body.goods.id);
}

/** Attaches an auction in the given state directly, so the derived status can be checked on its own. */
async function attachAuction(goodsId: bigint, status: string, winner?: string) {
  const goods = await prisma.goods.findUniqueOrThrow({ where: { id: goodsId } });
  const winnerId = winner ? (await prisma.user.findUniqueOrThrow({ where: { username: winner } })).id : null;
  await prisma.auction.create({
    data: {
      sellerId: goods.sellerId,
      goodsId,
      winnerId,
      name: goods.name,
      initialPrice: 10,
      durationMinutes: 60,
      startTime: new Date(Date.now() - 3600_000),
      endTime: new Date(Date.now() + (status === 'ended' || status === 'cancelled' ? -60_000 : 3600_000)),
      status,
    },
  });
}

describe('gds-001 GET /api/me/goods', () => {
  beforeEach(resetDb);

  it('returns only the caller goods, newest first, with images and a derived status', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const free = await addGoods(alice, 'Free lamp');
    const running = await addGoods(alice, 'Running lamp');
    const sold = await addGoods(alice, 'Sold lamp');
    const unsold = await addGoods(alice, 'Unsold lamp');
    const cancelled = await addGoods(alice, 'Cancelled lamp');
    await addGoods(bob, 'Bob chair');
    await attachAuction(running, 'active');
    await attachAuction(sold, 'ended', 'bob');
    await attachAuction(unsold, 'ended');
    await attachAuction(cancelled, 'cancelled');

    const res = await alice.get('/api/me/goods');
    expect(res.status).toBe(200);
    expect(res.body.goods.map((g: { name: string; status: string }) => [g.name, g.status])).toEqual([
      ['Cancelled lamp', 'available'],
      ['Unsold lamp', 'available'],
      ['Sold lamp', 'sold'],
      ['Running lamp', 'in_auction'],
      ['Free lamp', 'available'],
    ]);
    expect(res.body.goods[0].images[0]).toMatch(/^\/uploads\//);
    expect(res.body.goods.find((g: { id: number }) => BigInt(g.id) === free).category.name).toBeTruthy();

    const bobs = (await bob.get('/api/me/goods')).body.goods;
    expect(bobs.map((g: { name: string }) => g.name)).toEqual(['Bob chair']);
  });

  it('upcoming counts as in an auction; deleted goods are left out; signing in is required', async () => {
    const alice = await loginAs('alice');
    const upcoming = await addGoods(alice, 'Upcoming lamp');
    const gone = await addGoods(alice, 'Gone lamp');
    await attachAuction(upcoming, 'upcoming');
    await prisma.goods.update({ where: { id: gone }, data: { status: 'deleted' } });
    const res = await alice.get('/api/me/goods');
    expect(res.body.goods.map((g: { name: string; status: string }) => [g.name, g.status])).toEqual([['Upcoming lamp', 'in_auction']]);
    expect((await request(app).get('/api/me/goods')).status).toBe(401);
  });

  it('goodsState: a sale wins over a later open auction record; otherwise any open auction means in_auction', () => {
    expect(goodsState([])).toBe('available');
    expect(goodsState([{ status: 'ended', winnerId: null }, { status: 'cancelled', winnerId: null }])).toBe('available');
    expect(goodsState([{ status: 'active', winnerId: null }])).toBe('in_auction');
    expect(goodsState([{ status: 'ended', winnerId: 1n }])).toBe('sold');
  });
});
