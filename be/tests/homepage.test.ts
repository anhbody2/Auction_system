import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

describe('guest-002 homepage listing', () => {
  const ids: Record<string, number> = {};
  beforeAll(async () => {
    await resetDb();
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    ids.active = (await createAuction(alice, { name: 'Live lamp' })).id;
    ids.upcoming = (await createAuction(alice, { name: 'Soon lamp', startTime: inMinutes(30), duration: { value: 1, unit: 'hours' } })).id;
    ids.ended = (await createAuction(alice, { name: 'Done lamp', initialPrice: 100 })).id;
    await bob.post(`/api/auctions/${ids.ended}/bids`).send({ amount: 100 });
    await prisma.auction.update({ where: { id: BigInt(ids.ended) }, data: { endTime: new Date(Date.now() - 1000) } });
    ids.old = (await createAuction(alice, { name: 'Old lamp' })).id;
    await prisma.auction.update({ where: { id: BigInt(ids.old) }, data: { status: 'ended', endTime: new Date(Date.now() - 10 * 24 * 3600 * 1000) } });
    ids.cancelled = (await createAuction(alice, { name: 'Cancelled lamp' })).id;
    await alice.post(`/api/auctions/${ids.cancelled}/cancel`);
  });

  it('guests see live, upcoming and just-completed auctions (not cancelled or old)', async () => {
    const res = await request(app).get('/api/auctions');
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.auctions.map((a: { name: string }) => [a.name, a]));
    expect(Object.keys(byName).sort()).toEqual(['Done lamp', 'Live lamp', 'Soon lamp']);
    expect(byName['Live lamp']).toMatchObject({ status: 'active', endTime: expect.any(String) });
    expect(byName['Soon lamp'].status).toBe('upcoming');
    expect(byName['Done lamp']).toMatchObject({ status: 'ended', nextMinBid: null, winner: { username: 'bob' }, currentPrice: 100 });
  });

  it('guests cannot bid', async () => {
    const res = await request(app).post(`/api/auctions/${ids.active}/bids`).send({ amount: 500 });
    expect(res.status).toBe(401);
  });
});
