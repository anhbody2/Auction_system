import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { goodsState } from '../src/lib/goods';
import { app, loginAs, resetDb } from './helpers';
import { addGoods, attachAuction } from './goods.fixtures';
import { useTempUploadDir } from './upload.fixtures';

useTempUploadDir();

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
