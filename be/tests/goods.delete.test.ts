import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, loginAs, resetDb } from './helpers';
import { addGoods, attachAuction } from './goods.fixtures';
import { useTempUploadDir } from './upload.fixtures';

useTempUploadDir();

const names = async (agent: request.Agent) => (await agent.get('/api/me/goods')).body.goods.map((g: { name: string }) => g.name);

describe('gds-002 DELETE /api/goods/:id', () => {
  beforeEach(resetDb);

  it('soft deletes available goods: status deleted, gone from My goods, cannot be fetched or deleted again', async () => {
    const alice = await loginAs('alice');
    const id = await addGoods(alice, 'Spare lamp');
    await addGoods(alice, 'Kept lamp');
    const res = await alice.delete(`/api/goods/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Goods deleted');
    expect((await prisma.goods.findUniqueOrThrow({ where: { id } })).status).toBe('deleted');
    expect(await names(alice)).toEqual(['Kept lamp']);
    expect((await alice.get(`/api/goods/${id}`)).status).toBe(404);
    expect((await alice.delete(`/api/goods/${id}`)).status).toBe(404);
    expect((await alice.patch(`/api/goods/${id}`).send({ name: 'Back again' })).status).toBe(404);
  });

  it('goods in an active or upcoming auction, or sold, are 409 and stay', async () => {
    const alice = await loginAs('alice');
    const cases: [string, string | undefined, string][] = [
      ['active', undefined, 'Goods in an active auction cannot be changed'],
      ['upcoming', undefined, 'Goods in an active auction cannot be changed'],
      ['ended', 'bob', 'Sold goods cannot be changed'],
    ];
    for (const [status, winner, message] of cases) {
      const id = await addGoods(alice, `Locked ${status}`);
      await attachAuction(id, status, winner);
      const res = await alice.delete(`/api/goods/${id}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe(message);
      expect((await prisma.goods.findUniqueOrThrow({ where: { id } })).status).toBe('active');
    }
  });

  it('goods whose only auction was cancelled or ended unsold can be deleted, and that past auction still loads', async () => {
    const alice = await loginAs('alice');
    for (const status of ['cancelled', 'ended']) {
      const id = await addGoods(alice, `Past ${status}`);
      const auction = await attachAuction(id, status);
      expect((await alice.delete(`/api/goods/${id}`)).status).toBe(200);
      const page = await request(app).get(`/api/auctions/${auction.id}`);
      expect(page.status).toBe(200);
      expect(page.body.auction.goods.name).toBe(`Past ${status}`);
    }
    expect(await names(alice)).toEqual([]);
  });

  it('a non-owner gets 404; signing in is required', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const id = await addGoods(alice, 'Alice lamp');
    expect((await bob.delete(`/api/goods/${id}`)).status).toBe(404);
    expect((await request(app).delete(`/api/goods/${id}`)).status).toBe(401);
    expect(await names(alice)).toEqual(['Alice lamp']);
  });
});
