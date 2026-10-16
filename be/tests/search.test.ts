import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, loginAs, resetDb } from './helpers';

const names = async (query: string) =>
  ((await request(app).get(`/api/auctions?${query}`)).body.auctions as { name: string }[]).map((a) => a.name).sort();

describe('guest-003 search', () => {
  beforeAll(async () => {
    await resetDb();
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const cats = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.name, Number(c.id)]));
    await createAuction(alice, { name: 'Leica M6 camera', description: 'Rangefinder film body.', categoryId: cats.Electronics });
    await createAuction(alice, { name: 'Oak dining table', description: 'Seats six, solid oak.', categoryId: cats['Home and Garden'] });
    await createAuction(bob, { name: 'Signed baseball', description: 'Comes with a camera-ready display case.', categoryId: cats.Collectibles });
    const ended = await createAuction(bob, { name: 'Polaroid camera', description: 'Instant film camera.', categoryId: cats.Electronics });
    await prisma.auction.update({ where: { id: BigInt(ended.id) }, data: { endTime: new Date(Date.now() - 1000) } });
    const cancelled = await createAuction(bob, { name: 'Cancelled camera', categoryId: cats.Electronics });
    await bob.post(`/api/auctions/${cancelled.id}/cancel`);
  });

  it('by seller name (username or full name)', async () => {
    expect(await names('q=alice&field=seller')).toEqual(['Leica M6 camera', 'Oak dining table']);
    expect(await names('q=Bob%20Bidder&field=seller')).toEqual(['Polaroid camera', 'Signed baseball']);
  });

  it('by auction name/description, including just-completed but not cancelled', async () => {
    expect(await names('q=CAMERA&field=auction')).toEqual(['Leica M6 camera', 'Polaroid camera', 'Signed baseball']);
  });

  it('by category', async () => {
    expect(await names('q=electro&field=category')).toEqual(['Leica M6 camera', 'Polaroid camera']);
  });

  it('by product (goods name/description)', async () => {
    expect(await names('q=oak&field=product')).toEqual(['Oak dining table']);
  });

  it('all fields, no match, and invalid field', async () => {
    expect(await names('q=collectibles')).toEqual(['Signed baseball']);
    expect(await names('q=zzzz-nothing')).toEqual([]);
    expect((await request(app).get('/api/auctions?q=x&field=price')).status).toBe(400);
  });
});
