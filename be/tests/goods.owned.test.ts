import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { closeDueAuctions } from '../src/lib/settlement';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

beforeAll(() => {
  process.env.SETTLE_ON_REQUEST = '0';
});
afterAll(() => {
  delete process.env.SETTLE_ON_REQUEST;
});

type Owned = { id: number; name: string; status: string; wonPrice: number | null; wonAt: string | null };
const owned = async (agent: request.Agent) => (await agent.get('/api/me/goods/owned')).body.goods as Owned[];
const goodsOf = async (auctionId: number) => (await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(auctionId) } })).goodsId;

/** alice sells `name`; `buyer` wins it at `price`; the auction is closed and settled. */
async function sell(name: string, buyer: request.Agent, price: number) {
  const alice = await loginAs('alice');
  const a = await createAuction(alice, { name, initialPrice: price });
  expect((await buyer.post(`/api/auctions/${a.id}/bids`).send({ amount: price })).status).toBe(201);
  await prisma.auction.update({ where: { id: BigInt(a.id) }, data: { endTime: new Date(Date.now() - 1000) } });
  await closeDueAuctions();
  return goodsOf(a.id);
}

describe('ui-2a.2 GET /api/me/goods/owned', () => {
  beforeAll(resetDb);

  it('needs a session', async () => {
    expect((await request(app).get('/api/me/goods/owned')).status).toBe(401);
  });

  it('lists goods the user won with the winning price and date, newest first; not other users\' goods', async () => {
    const bob = await loginAs('bob');
    const lamp = await sell('Owned lamp', bob, 40);
    const clock = await sell('Owned clock', bob, 60);
    const list = await owned(bob);
    expect(list.map((g) => g.name)).toEqual(['Owned clock', 'Owned lamp']);
    expect(list[0]).toMatchObject({ id: Number(clock), status: 'available', wonPrice: 60 });
    expect(list[1]).toMatchObject({ id: Number(lamp), wonPrice: 40 });
    expect(new Date(list[0].wonAt!).getTime()).toBeGreaterThan(Date.now() - 60_000);
    // The seller and other customers do not see them here.
    expect(await owned(await loginAs('alice'))).toEqual([]);
    expect((await owned(await loginAs('carol'))).map((g) => g.name)).not.toContain('Owned lamp');
  });

  it('shows in_auction while listed again, and drops goods once sold on or deleted', async () => {
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const vase = await sell('Owned vase', bob, 30);
    const relisted = await bob.post('/api/auctions').send({
      goodsId: Number(vase),
      name: 'Owned vase again',
      description: 'Won it, selling it on again.',
      initialPrice: 35,
      startTime: inMinutes(0),
      duration: { value: 1, unit: 'hours' },
    });
    expect(relisted.status).toBe(201);
    expect((await owned(bob)).find((g) => g.id === Number(vase))?.status).toBe('in_auction');

    // carol wins the resale: the vase leaves bob's list and joins carol's with her price
    expect((await carol.post(`/api/auctions/${relisted.body.auction.id}/bids`).send({ amount: 35 })).status).toBe(201);
    await prisma.auction.update({ where: { id: BigInt(relisted.body.auction.id) }, data: { endTime: new Date(Date.now() - 1000) } });
    await closeDueAuctions();
    expect((await owned(bob)).map((g) => g.id)).not.toContain(Number(vase));
    expect((await owned(carol)).find((g) => g.id === Number(vase))).toMatchObject({ wonPrice: 35 });

    // Deleted goods are excluded
    await prisma.goods.update({ where: { id: vase }, data: { status: 'deleted' } });
    expect((await owned(carol)).map((g) => g.id)).not.toContain(Number(vase));
  });
});
