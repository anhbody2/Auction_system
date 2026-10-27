import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, loginAs, resetDb } from './helpers';

type Row = { id: number; name: string; status: string };
const completed = async (query = '', agent: { get: (url: string) => request.Test } = request(app)) => {
  const res = await agent.get(`/api/auctions${query ? `?${query}` : ''}`);
  expect(res.status).toBe(200);
  return (res.body.auctions as Row[]).filter((a) => a.status === 'ended').map((a) => a.name);
};
const HOUR = 3600 * 1000;

describe('home-2.1 the just-completed part of GET /api/auctions is the 8 most recently closed lots', () => {
  let cats: Record<string, number>;
  beforeAll(async () => {
    await resetDb();
    // Only this test's auctions: the seed may add its own.
    await prisma.$executeRawUnsafe('TRUNCATE auction_messages, auction_settlements, credit_transactions, bid_tickets, auctions RESTART IDENTITY CASCADE');
    cats = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.name, Number(c.id)]));
    const alice = await loginAs('alice');
    // Closed 1 closed an hour ago, Closed 9 nine hours ago, Closed 10 ten days ago. 9 and 10 are Art, the rest Electronics.
    // Prices rise with the number, so a price sort would reverse them.
    for (let i = 1; i <= 10; i++) {
      const a = await createAuction(alice, { name: `Closed ${i}`, initialPrice: 10 * i, categoryId: i >= 9 ? cats.Art : cats.Electronics });
      const endTime = new Date(Date.now() - (i === 10 ? 10 * 24 * HOUR : i * HOUR));
      // Closed 2 ended but the close job has not run yet (stored active).
      await prisma.auction.update({ where: { id: BigInt(a.id) }, data: { status: i === 2 ? 'active' : 'ended', startTime: new Date(endTime.getTime() - HOUR), endTime } });
    }
    // Newer than all of them, but cancelled or soft-deleted: never counted.
    const cancelled = await createAuction(alice, { name: 'Cancelled closed' });
    await prisma.auction.update({ where: { id: BigInt(cancelled.id) }, data: { status: 'cancelled', endTime: new Date(Date.now() - 60_000) } });
    const deleted = await createAuction(alice, { name: 'Deleted closed' });
    await prisma.auction.update({ where: { id: BigInt(deleted.id) }, data: { status: 'ended', endTime: new Date(Date.now() - 60_000), deletedAt: new Date() } });
  });

  it('returns exactly the 8 newest closed lots, newest first, and says so with justCompletedLimit', async () => {
    const res = await request(app).get('/api/auctions');
    expect(res.body.justCompletedLimit).toBe(8);
    expect(res.body.justCompletedDays).toBeUndefined();
    expect(await completed()).toEqual(['Closed 1', 'Closed 2', 'Closed 3', 'Closed 4', 'Closed 5', 'Closed 6', 'Closed 7', 'Closed 8']);
  });

  it('a sort does not reorder the completed lots', async () => {
    expect(await completed('sort=price_desc')).toEqual(await completed());
    expect(await completed('sort=price_asc')).toEqual(await completed());
  });

  it('filters apply before the limit; a lot closed 10 days ago counts when it is among the 8 newest matches', async () => {
    expect(await completed(`category=${cats.Art}`)).toEqual(['Closed 9', 'Closed 10']);
    expect(await completed('q=Closed%2010&field=auction')).toEqual(['Closed 10']);
    expect(await completed('endingSoon=1')).toEqual([]);
  });

  it('a guest and a signed-in customer get the same 8', async () => {
    expect(await completed('', await loginAs('bob'))).toEqual(await completed());
  });
});
