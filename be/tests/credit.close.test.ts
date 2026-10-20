import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { closeDueAuctions } from '../src/lib/settlement';
import { createAuction, loginAs, resetDb } from './helpers';

// Only the job settles here, so the "locked until close" window can be observed after end_time.
beforeAll(() => {
  process.env.SETTLE_ON_REQUEST = '0';
});
afterAll(() => {
  delete process.env.SETTLE_ON_REQUEST;
});

const expire = (id: number) => prisma.auction.update({ where: { id: BigInt(id) }, data: { endTime: new Date(Date.now() - 1000) } });
const money = async (username: string) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { username } });
  return { balance: u.creditBalance.toNumber(), held: u.heldBalance.toNumber() };
};
const bid = (agent: request.Agent, auctionId: number, amount: number) => agent.post(`/api/auctions/${auctionId}/bids`).send({ amount });

describe('crd-001 the winning lock lasts until close; commission is taken at close', () => {
  beforeEach(resetDb);

  it('the leader stays locked past the end time until the close job; then pays, the seller is paid minus commission, the outbid bidder pays nothing', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { name: 'Oak Chair', initialPrice: 100 });
    await bid(bob, a.id, 100);
    await bid(carol, a.id, 150);
    await expire(a.id);

    // Ended but not yet closed: carol's credit is still locked, nothing has been paid.
    expect(await money('carol')).toEqual({ balance: 500, held: 150 });
    expect(await money('alice')).toEqual({ balance: 1000, held: 0 });
    expect(await prisma.auctionSettlement.count()).toBe(0);

    expect(await closeDueAuctions()).toBe(1);

    expect(await money('carol')).toEqual({ balance: 350, held: 0 });
    expect(await money('bob')).toEqual({ balance: 1000, held: 0 });
    // $150 is in the 5% tier: commission $7.50
    expect(await money('alice')).toEqual({ balance: 1142.5, held: 0 });
    const settlement = await prisma.auctionSettlement.findUniqueOrThrow({ where: { auctionId: BigInt(a.id) } });
    expect(settlement.commissionAmount.toNumber()).toBe(7.5);

    const bobId = (await prisma.user.findUniqueOrThrow({ where: { username: 'bob' } })).id;
    expect(await prisma.creditTransaction.count({ where: { userId: bobId, transactionType: 'payment' } })).toBe(0);
  });

  it('reserve not met: the leader lock is released and their other locks are untouched', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const other = await createAuction(alice, { name: 'Other', initialPrice: 200 });
    const a = await createAuction(alice, { name: 'Reserve Vase', initialPrice: 100, reservePrice: 900 });
    await bid(bob, other.id, 200);
    await bid(bob, a.id, 150);
    expect(await money('bob')).toEqual({ balance: 1000, held: 350 });
    await expire(a.id);

    await closeDueAuctions();

    expect(await money('bob')).toEqual({ balance: 1000, held: 200 });
    expect(await money('alice')).toEqual({ balance: 1000, held: 0 });
  });

  it('cancelled by the seller: the leader lock is released and their other locks are untouched', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const other = await createAuction(alice, { name: 'Other', initialPrice: 200 });
    const a = await createAuction(alice, { name: 'Cancel Rug', initialPrice: 100 });
    await bid(bob, other.id, 200);
    await bid(bob, a.id, 150);

    expect((await alice.post(`/api/auctions/${a.id}/cancel`)).status).toBe(200);

    expect(await money('bob')).toEqual({ balance: 1000, held: 200 });
  });
});
