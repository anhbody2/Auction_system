import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { closeDueAuctions } from '../src/lib/settlement';
import { createAuction, insertAuction, loginAs, resetDb } from './helpers';

// Only the job settles here, so the hand-over is observed exactly at close.
beforeAll(() => {
  process.env.SETTLE_ON_REQUEST = '0';
});
afterAll(() => {
  delete process.env.SETTLE_ON_REQUEST;
});

const expire = (id: number) => prisma.auction.update({ where: { id: BigInt(id) }, data: { endTime: new Date(Date.now() - 1000) } });
const bid = (agent: request.Agent, auctionId: number, amount: number) => agent.post(`/api/auctions/${auctionId}/bids`).send({ amount });
const userId = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;
const goodsOf = async (auctionId: number) =>
  prisma.goods.findUniqueOrThrow({ where: { id: (await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(auctionId) } })).goodsId } });

describe('gds-003 goods.buyer_id is set when an auction is won', () => {
  beforeEach(resetDb);

  it('closing with a winning bid sets buyer = winner together with the settlement; seller stays', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { name: 'Brass Lamp', initialPrice: 100 });
    await bid(bob, a.id, 100);
    expect((await goodsOf(a.id)).buyerId).toBeNull();
    await expire(a.id);
    // Ended but not yet closed: no hand-over yet.
    expect((await goodsOf(a.id)).buyerId).toBeNull();

    expect(await closeDueAuctions()).toBe(1);
    const goods = await goodsOf(a.id);
    expect(goods.buyerId).toBe(await userId('bob'));
    expect(goods.sellerId).toBe(await userId('alice'));
    const settlement = await prisma.auctionSettlement.findUniqueOrThrow({ where: { auctionId: BigInt(a.id) } });
    expect(settlement.settlementStatus).toBe('settled');
  });

  it('a failing hand-over rolls the whole settlement back (same transaction)', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { name: 'Glass Lamp', initialPrice: 100 });
    await bid(bob, a.id, 100);
    await expire(a.id);
    // Make the goods update fail inside settlement.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION gds003_block() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked'; END $$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER gds003_block BEFORE UPDATE ON goods FOR EACH ROW EXECUTE FUNCTION gds003_block()`);
    try {
      await expect(closeDueAuctions()).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER gds003_block ON goods`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION gds003_block()`);
    }
    expect(await prisma.auctionSettlement.count({ where: { auctionId: BigInt(a.id) } })).toBe(0);
    expect((await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(a.id) } })).status).not.toBe('ended');
    expect((await goodsOf(a.id)).buyerId).toBeNull();

    // Without the trigger it settles normally.
    expect(await closeDueAuctions()).toBe(1);
    expect((await goodsOf(a.id)).buyerId).toBe(await userId('bob'));
  });

  it('no bids, reserve not met, or a cancel leave buyer unchanged', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const admin = await loginAs('admin');
    const empty = await createAuction(alice, { name: 'Empty Lamp' });
    const reserve = await createAuction(alice, { name: 'Reserve Lamp', initialPrice: 100, reservePrice: 900 });
    const cancelled = await createAuction(alice, { name: 'Cancelled Lamp', initialPrice: 100 });
    await bid(bob, reserve.id, 150);
    await bid(bob, cancelled.id, 100);
    expect((await admin.post(`/api/auctions/${cancelled.id}/cancel`)).status).toBe(200);
    await expire(empty.id);
    await expire(reserve.id);
    expect(await closeDueAuctions()).toBe(2);

    for (const a of [empty, reserve, cancelled]) expect((await goodsOf(a.id)).buyerId).toBeNull();
  });

  it('the migration backfills buyer (and seller) from the last auction that ended with a winner', async () => {
    const [aliceId, bobId, carolId] = [await userId('alice'), await userId('bob'), await userId('carol')];
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
    const sold = await insertAuction({ seller: 'alice', name: 'Old sale', start: hoursAgo(3), end: hoursAgo(2), sold: { winner: 'bob', price: 100, commission: 10 } });
    const unsold = await insertAuction({ seller: 'alice', name: 'Old unsold', start: hoursAgo(3), end: hoursAgo(2), status: 'ended' });
    // Goods sold twice before the column existed: alice -> bob, then bob -> carol.
    const twice = await insertAuction({ seller: 'alice', name: 'Old resale', start: hoursAgo(5), end: hoursAgo(4), sold: { winner: 'bob', price: 100, commission: 10 } });
    await prisma.auction.create({
      data: {
        sellerId: bobId,
        goodsId: twice.goodsId,
        winnerId: carolId,
        name: 'Old resale 2',
        initialPrice: 10,
        durationMinutes: 60,
        startTime: new Date(hoursAgo(2)),
        endTime: new Date(hoursAgo(1)),
        status: 'ended',
      },
    });

    const sql = readFileSync(join(__dirname, '../prisma/migrations/20261021090000_goods_buyer/migration.sql'), 'utf8');
    const backfill = sql.slice(sql.indexOf('UPDATE "goods"'));
    await prisma.$executeRawUnsafe(backfill);

    const goods = async (goodsId: bigint) => prisma.goods.findUniqueOrThrow({ where: { id: goodsId } });
    expect(await goods(sold.goodsId)).toMatchObject({ sellerId: aliceId, buyerId: bobId });
    expect(await goods(unsold.goodsId)).toMatchObject({ sellerId: aliceId, buyerId: null });
    expect(await goods(twice.goodsId)).toMatchObject({ sellerId: bobId, buyerId: carolId });
  });
});
