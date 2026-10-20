import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

describe('cust-006 manage your auctions', () => {
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    await resetDb();
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    ids.active = (await createAuction(alice, { name: 'Active one', initialPrice: 50 })).id;
    await bob.post(`/api/auctions/${ids.active}/bids`).send({ amount: 75 });
    ids.upcoming = (await createAuction(alice, { name: 'Upcoming one', startTime: inMinutes(60), duration: { value: 1, unit: 'hours' } })).id;
    ids.ended = (await createAuction(alice, { name: 'Ended one' })).id;
    await prisma.auction.update({ where: { id: BigInt(ids.ended) }, data: { endTime: new Date(Date.now() - 1000) } });
    ids.cancelled = (await createAuction(alice, { name: 'Cancelled one' })).id;
    await alice.post(`/api/auctions/${ids.cancelled}/cancel`);
    await createAuction(bob, { name: 'Bob auction' });
  });

  it('lists only my auctions with status and current highest bid', async () => {
    const alice = await loginAs('alice');
    const { auctions } = (await alice.get('/api/me/auctions')).body;
    const byName = Object.fromEntries(auctions.map((a: { name: string }) => [a.name, a]));
    expect(Object.keys(byName).sort()).toEqual(['Active one', 'Cancelled one', 'Ended one', 'Upcoming one']);
    expect(byName['Active one']).toMatchObject({ status: 'active', currentPrice: 75, bidCount: 1 });
    expect(byName['Upcoming one'].status).toBe('upcoming');
    expect(byName['Ended one'].status).toBe('ended');
    expect(byName['Cancelled one'].status).toBe('cancelled');
  });

  it('opens an auction with its details and bid history', async () => {
    const detail = (await request(app).get(`/api/auctions/${ids.active}`)).body.auction;
    expect(detail).toMatchObject({ name: 'Active one', currentPrice: 75 });
    const bids = (await request(app).get(`/api/auctions/${ids.active}/bids`)).body.bids;
    expect(bids).toHaveLength(1);
    expect(bids[0]).toMatchObject({ amount: 75, bidder: { username: 'bob' } });
  });
});
