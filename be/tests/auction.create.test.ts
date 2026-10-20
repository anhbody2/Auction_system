import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

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
    const a = await createAuction(alice, { startTime: inMinutes(30), endTime: inMinutes(90) });
    expect(a.status).toBe('upcoming');
    expect(a.durationMinutes).toBe(60);
  });

  it('rejects negative price, end before start, and missing fields', async () => {
    const alice = await loginAs('alice');
    const res = await alice.post('/api/auctions').send({
      name: '',
      description: 'short',
      categoryId: '',
      condition: 'broken',
      initialPrice: -5,
      startTime: inMinutes(60),
      endTime: inMinutes(10),
    });
    expect(res.status).toBe(400);
    expect(res.body.fields).toMatchObject({
      name: expect.any(String),
      description: expect.any(String),
      categoryId: 'Choose a category',
      condition: 'Choose a condition',
      initialPrice: 'Starting price must be greater than 0',
      endTime: 'End time must be after start time',
    });
  });

  it('rejects reserve below starting price', async () => {
    const alice = await loginAs('alice');
    await expect(createAuction(alice, { initialPrice: 100, reservePrice: 50 })).rejects.toThrow(/Reserve price cannot be below/);
  });
});
