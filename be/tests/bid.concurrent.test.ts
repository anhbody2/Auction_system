import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { createAuction, loginAs, resetDb } from './helpers';

const heldOf = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).heldBalance.toNumber();

describe('rt-001 concurrent bids', () => {
  beforeEach(resetDb);

  it('two bidders sending the same amount at once: exactly one wins, holds stay consistent', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { initialPrice: 100 });
    const before: Record<string, number> = { bob: await heldOf('bob'), carol: await heldOf('carol') };

    const [rb, rc] = await Promise.all([
      bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 }),
      carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 }),
    ]);
    expect([rb.status, rc.status].sort()).toEqual([201, 400]);
    const loser = rb.status === 400 ? rb : rc;
    expect(loser.body.error).toBe('Bid must be at least $110.00');

    const tickets = await prisma.bidTicket.findMany({ where: { auctionId: BigInt(a.id) } });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].status).toBe('active');
    const winner = rb.status === 201 ? 'bob' : 'carol';
    const other = winner === 'bob' ? 'carol' : 'bob';
    expect(await heldOf(winner)).toBe(before[winner] + 100);
    expect(await heldOf(other)).toBe(before[other]);
    const auction = await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(a.id) } });
    expect(auction.currentPrice?.toNumber()).toBe(100);
  });

  it('many concurrent bids leave one active ticket, and holds match it', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { initialPrice: 100 });
    const amounts = [100, 110, 120, 130, 140, 150];
    await Promise.all(amounts.map((amount, i) => (i % 2 ? carol : bob).post(`/api/auctions/${a.id}/bids`).send({ amount })));

    const active = await prisma.bidTicket.findMany({ where: { auctionId: BigInt(a.id), status: 'active' } });
    expect(active).toHaveLength(1);
    const leaderAmount = active[0].amount.toNumber();
    const auction = await prisma.auction.findUniqueOrThrow({ where: { id: BigInt(a.id) } });
    expect(auction.currentPrice?.toNumber()).toBe(leaderAmount);
    // Seeded users hold nothing before this test, so their holds are exactly this auction's.
    const users = await prisma.user.findMany({ where: { username: { in: ['bob', 'carol'] } } });
    const leader = users.find((u) => u.id === active[0].bidderId)!;
    const trailer = users.find((u) => u.id !== active[0].bidderId)!;
    expect(leader.heldBalance.toNumber()).toBe(leaderAmount);
    expect(trailer.heldBalance.toNumber()).toBe(0);
  });
});
