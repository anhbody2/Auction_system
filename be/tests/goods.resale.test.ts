import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { closeDueAuctions } from '../src/lib/settlement';
import { createAuction, inMinutes, loginAs, resetDb } from './helpers';

beforeAll(() => {
  process.env.SETTLE_ON_REQUEST = '0';
});
afterAll(() => {
  delete process.env.SETTLE_ON_REQUEST;
});

const expire = (id: number) => prisma.auction.update({ where: { id: BigInt(id) }, data: { endTime: new Date(Date.now() - 1000) } });
const bid = (agent: request.Agent, auctionId: number, amount: number) => agent.post(`/api/auctions/${auctionId}/bids`).send({ amount });
const userId = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;
type GoodsJson = { id: number; name: string; status: string; bought: boolean };
const myGoods = async (agent: request.Agent, query = '') => (await agent.get(`/api/me/goods${query}`)).body.goods as GoodsJson[];
const find = (list: GoodsJson[], id: bigint) => list.find((g) => BigInt(g.id) === id);
const auctionTerms = (goodsId: bigint, name: string) => ({
  goodsId: Number(goodsId),
  name,
  description: 'Bought it, selling it on again.',
  initialPrice: 100,
  startTime: inMinutes(0),
  duration: { value: 1, unit: 'hours' },
});

describe('gds-003 a buyer re-auctions the goods; buyer moves to seller on the resale', () => {
  beforeEach(resetDb);

  it('alice -> bob -> carol: ownership, listings and auction rights follow each sale', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const [aliceId, bobId, carolId] = [await userId('alice'), await userId('bob'), await userId('carol')];

    // First sale: alice -> bob
    const first = await createAuction(alice, { name: 'Walnut Desk', initialPrice: 100 });
    const goodsId = (await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(first.id) } })).goodsId;
    await bid(bob, first.id, 100);
    await expire(first.id);
    expect(await closeDueAuctions()).toBe(1);
    expect(await prisma.goods.findUniqueOrThrow({ where: { id: goodsId } })).toMatchObject({ sellerId: aliceId, buyerId: bobId });

    // bob sees it as bought and available; alice sees it sold and cannot pick it.
    expect(find(await myGoods(bob), goodsId)).toMatchObject({ status: 'available', bought: true });
    expect(find(await myGoods(bob, '?status=available'), goodsId)).toBeTruthy();
    expect(find(await myGoods(alice), goodsId)).toMatchObject({ status: 'sold', bought: false });
    expect(find(await myGoods(alice, '?status=available'), goodsId)).toBeUndefined();

    const aliceAgain = await alice.post('/api/auctions').send(auctionTerms(goodsId, 'Walnut Desk again'));
    expect(aliceAgain.status).toBe(403);
    expect(aliceAgain.body.fields.goodsId).toBe('These goods have been sold');
    // A stranger still gets 404.
    expect((await carol.post('/api/auctions').send(auctionTerms(goodsId, 'Not mine'))).status).toBe(404);
    // alice can no longer edit or delete it either.
    expect((await alice.patch(`/api/goods/${goodsId}`).send({ name: 'Renamed desk' })).status).toBe(409);
    expect((await alice.delete(`/api/goods/${goodsId}`)).status).toBe(409);

    // Resale: bob -> carol
    const resale = await bob.post('/api/auctions').send(auctionTerms(goodsId, 'Walnut Desk, barely used'));
    expect(resale.status).toBe(201);
    expect(find(await myGoods(bob), goodsId)).toMatchObject({ status: 'in_auction', bought: true });
    expect(find(await myGoods(alice), goodsId)).toMatchObject({ status: 'sold' });
    const bobBefore = (await prisma.user.findUniqueOrThrow({ where: { id: bobId } })).creditBalance.toNumber();
    await bid(carol, resale.body.auction.id, 100);
    await expire(resale.body.auction.id);
    expect(await closeDueAuctions()).toBe(1);

    expect(await prisma.goods.findUniqueOrThrow({ where: { id: goodsId } })).toMatchObject({ sellerId: bobId, buyerId: carolId });
    // bob (the reseller) is paid: $100 minus the 5% commission.
    expect((await prisma.user.findUniqueOrThrow({ where: { id: bobId } })).creditBalance.toNumber()).toBe(bobBefore + 95);

    expect(find(await myGoods(bob), goodsId)).toMatchObject({ status: 'sold', bought: false });
    expect(find(await myGoods(carol), goodsId)).toMatchObject({ status: 'available', bought: true });
    // alice is no longer seller or buyer of these goods.
    expect(find(await myGoods(alice), goodsId)).toBeUndefined();
    expect((await bob.post('/api/auctions').send(auctionTerms(goodsId, 'Once more'))).status).toBe(403);
    expect((await carol.post('/api/auctions').send(auctionTerms(goodsId, 'Carol sells it'))).status).toBe(201);
  });

  it('a resale that ends without a winner leaves the goods with the buyer', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const first = await createAuction(alice, { name: 'Teak Shelf', initialPrice: 100 });
    const goodsId = (await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(first.id) } })).goodsId;
    await bid(bob, first.id, 100);
    await expire(first.id);
    await closeDueAuctions();

    const resale = await bob.post('/api/auctions').send(auctionTerms(goodsId, 'Teak Shelf resale'));
    expect(resale.status).toBe(201);
    await expire(resale.body.auction.id);
    await closeDueAuctions();

    expect(await prisma.goods.findUniqueOrThrow({ where: { id: goodsId } })).toMatchObject({ sellerId: await userId('alice'), buyerId: await userId('bob') });
    expect(find(await myGoods(bob), goodsId)).toMatchObject({ status: 'available', bought: true });
  });
});
