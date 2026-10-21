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

    // gds-003: bob also sees the lamp he won, as bought and available to him.
    const bobs = (await bob.get('/api/me/goods')).body.goods;
    expect(bobs.map((g: { name: string; status: string; bought: boolean }) => [g.name, g.status, g.bought])).toEqual([
      ['Bob chair', 'available', false],
      ['Sold lamp', 'available', true],
    ]);
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

  it('goodsState (gds-003): sold for a seller who no longer owns them; for the owner any open auction means in_auction', () => {
    const seller = 1n;
    const buyer = 2n;
    const own = (auctions: { status: string }[], buyerId: bigint | null = null) => ({ sellerId: seller, buyerId, auctions });
    expect(goodsState(own([]), seller)).toBe('available');
    expect(goodsState(own([{ status: 'ended' }, { status: 'cancelled' }]), seller)).toBe('available');
    expect(goodsState(own([{ status: 'active' }]), seller)).toBe('in_auction');
    // Sold to the buyer: the seller sees sold, the buyer owns them and can auction them again.
    expect(goodsState(own([{ status: 'ended' }], buyer), seller)).toBe('sold');
    expect(goodsState(own([{ status: 'ended' }], buyer), buyer)).toBe('available');
    // The buyer's own re-auction: in_auction for the buyer, still sold for the former seller.
    expect(goodsState(own([{ status: 'upcoming' }, { status: 'ended' }], buyer), buyer)).toBe('in_auction');
    expect(goodsState(own([{ status: 'upcoming' }, { status: 'ended' }], buyer), seller)).toBe('sold');
  });

  it('sell-006: ?status=available returns only the caller available goods; no filter still returns all', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    await addGoods(alice, 'Free lamp');
    const running = await addGoods(alice, 'Running lamp');
    const upcoming = await addGoods(alice, 'Upcoming lamp');
    const sold = await addGoods(alice, 'Sold lamp');
    const unsold = await addGoods(alice, 'Unsold lamp');
    await addGoods(bob, 'Bob chair');
    await attachAuction(running, 'active');
    await attachAuction(upcoming, 'upcoming');
    await attachAuction(sold, 'ended', 'bob');
    await attachAuction(unsold, 'ended');

    const res = await alice.get('/api/me/goods?status=available');
    expect(res.status).toBe(200);
    expect(res.body.goods.map((g: { name: string }) => g.name)).toEqual(['Unsold lamp', 'Free lamp']);
    expect(res.body.goods.every((g: { status: string }) => g.status === 'available')).toBe(true);

    expect((await alice.get('/api/me/goods')).body.goods).toHaveLength(5);
    expect((await alice.get('/api/me/goods?status=sold')).body.goods.map((g: { name: string }) => g.name)).toEqual(['Sold lamp']);
    expect((await alice.get('/api/me/goods?status=nonsense')).status).toBe(400);
  });
});
