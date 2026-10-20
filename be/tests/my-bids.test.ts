import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { createAuction, loginAs, resetDb } from './helpers';

const expire = (id: number) => prisma.auction.update({ where: { id: BigInt(id) }, data: { endTime: new Date(Date.now() - 1000) } });

describe('cust-007 manage your biddings (+ settlement)', () => {
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    await resetDb();
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const mk = async (name: string, extra = {}) => (await createAuction(alice, { name, initialPrice: 100, ...extra })).id;

    ids.winning = await mk('Winning');
    await bob.post(`/api/auctions/${ids.winning}/bids`).send({ amount: 100 });

    ids.outbid = await mk('Outbid');
    await bob.post(`/api/auctions/${ids.outbid}/bids`).send({ amount: 100 });
    await carol.post(`/api/auctions/${ids.outbid}/bids`).send({ amount: 120 });

    ids.won = await mk('Won');
    await carol.post(`/api/auctions/${ids.won}/bids`).send({ amount: 100 });
    await bob.post(`/api/auctions/${ids.won}/bids`).send({ amount: 200 });
    await expire(ids.won);

    ids.lost = await mk('Lost');
    await bob.post(`/api/auctions/${ids.lost}/bids`).send({ amount: 100 });
    await carol.post(`/api/auctions/${ids.lost}/bids`).send({ amount: 110 });
    await expire(ids.lost);

    ids.reserve = await mk('Reserve not met', { reservePrice: 900 });
    await bob.post(`/api/auctions/${ids.reserve}/bids`).send({ amount: 150 });
    await expire(ids.reserve);

    ids.cancelled = await mk('Cancelled');
    await bob.post(`/api/auctions/${ids.cancelled}/bids`).send({ amount: 100 });
    await alice.post(`/api/auctions/${ids.cancelled}/cancel`);

    await mk('Never bid by bob');
  });

  it('lists only my bids with latest bid, highest bid and status', async () => {
    const bob = await loginAs('bob');
    const { items } = (await bob.get('/api/me/bids')).body;
    const byName = Object.fromEntries(items.map((i: { auction: { name: string } }) => [i.auction.name, i]));
    expect(Object.keys(byName).sort()).toEqual(['Cancelled', 'Lost', 'Outbid', 'Reserve not met', 'Winning', 'Won']);
    expect(byName.Winning).toMatchObject({ myStatus: 'winning', myLatestBid: 100, auction: { currentPrice: 100 } });
    expect(byName.Outbid).toMatchObject({ myStatus: 'outbid', myLatestBid: 100, auction: { currentPrice: 120 } });
    expect(byName.Won).toMatchObject({ myStatus: 'won', myLatestBid: 200, auction: { status: 'ended', winner: { username: 'bob' } } });
    expect(byName.Lost).toMatchObject({ myStatus: 'lost', auction: { winner: { username: 'carol' } } });
    expect(byName['Reserve not met']).toMatchObject({ myStatus: 'lost', auction: { winner: null } });
    expect(byName.Cancelled.myStatus).toBe('cancelled');
  });

  it('settles credit: winner paid, seller paid minus tiered commission (5% at $200), losers released', async () => {
    const bob = (await (await loginAs('bob')).get('/api/credit')).body;
    // bob: won 200 (paid), winning 100 (held); everything else released
    expect(bob).toMatchObject({ balance: 800, held: 100, available: 700 });
    const carol = (await (await loginAs('carol')).get('/api/credit')).body;
    // carol: won 'Lost' at 110 (paid), leads 'Outbid' at 120 (held)
    expect(carol).toMatchObject({ balance: 390, held: 120, available: 270 });
    const alice = (await (await loginAs('alice')).get('/api/credit')).body;
    expect(alice.balance).toBeCloseTo(1000 + 190 + 104.5, 2);
    const settlement = await prisma.auctionSettlement.findUnique({ where: { auctionId: BigInt(ids.won) } });
    expect(settlement).toMatchObject({ settlementStatus: 'settled' });
    expect(Number(settlement!.commissionAmount)).toBe(10);
  });

  it('settlement is idempotent', async () => {
    const { settleAuction } = await import('../src/lib/settlement');
    expect(await settleAuction(BigInt(ids.won))).toBe(false);
    const payouts = await prisma.creditTransaction.count({ where: { auctionId: BigInt(ids.won), transactionType: 'payout' } });
    expect(payouts).toBe(1);
  });
});
