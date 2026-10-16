import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { auctionJobs } from '../src/lib/scheduler';
import { closeDueAuctions } from '../src/lib/settlement';
import { app, createAuction, loginAs, resetDb } from './helpers';

// Turn off the per-request safety net so these tests prove the job alone closes auctions.
beforeAll(() => {
  process.env.SETTLE_ON_REQUEST = '0';
});
afterAll(() => {
  delete process.env.SETTLE_ON_REQUEST;
});

const expire = (id: number) => prisma.auction.update({ where: { id: BigInt(id) }, data: { endTime: new Date(Date.now() - 1000) } });
const auction = (id: number) => prisma.auction.findUniqueOrThrow({ where: { id: BigInt(id) } });
const user = (username: string) => prisma.user.findUniqueOrThrow({ where: { username } });
const money = (u: { creditBalance: { toNumber(): number }; heldBalance: { toNumber(): number } }) => ({
  balance: u.creditBalance.toNumber(),
  held: u.heldBalance.toNumber(),
});

describe('sys-002 close auction job and settlement', () => {
  beforeEach(resetDb);

  it('closes a due auction whose top bid meets the reserve: winner pays, seller is paid minus commission', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { initialPrice: 100, minIncrement: 10, reservePrice: 150 });
    await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 200 });
    await expire(a.id);
    expect((await auction(a.id)).status).toBe('active');

    expect(await closeDueAuctions()).toBe(1);

    const closed = await auction(a.id);
    const bobUser = await user('bob');
    expect(closed.status).toBe('ended');
    expect(closed.winnerId).toBe(bobUser.id);
    expect(closed.closedAt).not.toBeNull();
    const won = await prisma.bidTicket.findFirstOrThrow({ where: { auctionId: closed.id, bidderId: bobUser.id } });
    expect(won.status).toBe('won');

    const settlement = await prisma.auctionSettlement.findUniqueOrThrow({ where: { auctionId: closed.id } });
    expect(settlement).toMatchObject({ settlementStatus: 'settled', winningBidId: won.id });
    const commission = settlement.commissionAmount.toNumber();
    expect(commission).toBeGreaterThan(0);

    expect(money(bobUser)).toEqual({ balance: 800, held: 0 });
    expect(money(await user('alice'))).toEqual({ balance: 1000 + 200 - commission, held: 0 });
    expect(money(await user('carol'))).toEqual({ balance: 500, held: 0 });

    const ledger = await prisma.creditTransaction.findMany({ where: { auctionId: closed.id, transactionType: { in: ['payment', 'payout'] } } });
    expect(ledger.map((t) => [t.transactionType, t.userId, t.amount.toNumber()]).sort()).toEqual(
      [
        ['payment', bobUser.id, 200],
        ['payout', closed.sellerId, 200 - commission],
      ].sort(),
    );
  });

  it('reserve not met: no winner, every hold released, status ended', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { initialPrice: 100, minIncrement: 10, reservePrice: 900 });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 150 });
    expect(money(await user('bob'))).toEqual({ balance: 1000, held: 150 });
    await expire(a.id);

    await closeDueAuctions();

    const closed = await auction(a.id);
    expect(closed).toMatchObject({ status: 'ended', winnerId: null });
    expect(money(await user('bob'))).toEqual({ balance: 1000, held: 0 });
    expect(money(await user('alice'))).toEqual({ balance: 1000, held: 0 });
    expect((await prisma.auctionSettlement.findUniqueOrThrow({ where: { auctionId: closed.id } })).settlementStatus).toBe('reserve_not_met');
    expect(await prisma.bidTicket.count({ where: { auctionId: closed.id, status: { not: 'lost' } } })).toBe(0);
  });

  it('no bids: ended with no winner', async () => {
    const alice = await loginAs('alice');
    const a = await createAuction(alice);
    await expire(a.id);
    await closeDueAuctions();
    expect(await auction(a.id)).toMatchObject({ status: 'ended', winnerId: null });
    expect((await prisma.auctionSettlement.findUniqueOrThrow({ where: { auctionId: BigInt(a.id) } })).settlementStatus).toBe('no_bids');
  });

  it('does not touch auctions that are not yet due', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice);
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    expect(await closeDueAuctions()).toBe(0);
    expect((await auction(a.id)).status).toBe('active');
    expect(await prisma.auctionSettlement.count()).toBe(0);
  });

  it('concurrent and repeated runs settle each auction exactly once', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const a = await createAuction(alice, { name: `Batch ${i}` });
      await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
      await expire(a.id);
      ids.push(a.id);
    }

    const counts = await Promise.all([closeDueAuctions(2), closeDueAuctions(2), closeDueAuctions(2)]);
    expect(counts.reduce((x, y) => x + y, 0)).toBe(3);
    expect(await closeDueAuctions()).toBe(0);

    expect(await prisma.auctionSettlement.count()).toBe(3);
    expect(await prisma.creditTransaction.count({ where: { transactionType: 'payment' } })).toBe(3);
    expect(money(await user('bob'))).toEqual({ balance: 700, held: 0 });
  });

  it('the scheduler registers the close job at one hour by default', () => {
    expect(auctionJobs().map((j) => [j.name, j.intervalMs])).toContainEqual(['close-auctions', 3_600_000]);
  });

  it('rejects bids once the close date has passed, before the job has run', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice);
    await expire(a.id);

    const res = await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 500 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This auction has ended');
    expect((await auction(a.id)).status).toBe('active'); // still stored as active: the job has not run
    expect((await request(app).get(`/api/auctions/${a.id}`)).body.auction.status).toBe('ended');
  });
});
