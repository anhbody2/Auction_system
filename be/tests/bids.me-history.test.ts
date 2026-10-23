import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { closeDueAuctions } from '../src/lib/settlement';
import { createAuction, loginAs, resetDb } from './helpers';

const expire = (id: number) => prisma.auction.update({ where: { id: BigInt(id) }, data: { endTime: new Date(Date.now() - 1000) } });
type Item = { auction: { name: string }; myStatus: string; bidCount: number; creditState: string };

describe('ui-3a.1 GET /api/me/bids: bid counts, credit state and totals', () => {
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    await resetDb();
    // Only this test's bids for exact totals (the seed may add auctions with bids).
    await prisma.$executeRawUnsafe('TRUNCATE auction_messages, auction_settlements, credit_transactions, bid_tickets, auctions RESTART IDENTITY CASCADE');
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const mk = async (name: string) => (await createAuction(alice, { name, initialPrice: 100 })).id;
    const bid = (agent: typeof bob, id: number, amount: number) => agent.post(`/api/auctions/${id}/bids`).send({ amount });

    ids.leading = await mk('Leading');
    await bid(bob, ids.leading, 100);
    await bid(bob, ids.leading, 110); // raises his own bid: two bids, still leading

    ids.outbid = await mk('Outbid');
    await bid(bob, ids.outbid, 100);
    await bid(carol, ids.outbid, 110);

    ids.won = await mk('Won');
    await bid(carol, ids.won, 100);
    await bid(bob, ids.won, 110);
    await expire(ids.won);

    ids.lost = await mk('Lost');
    await bid(bob, ids.lost, 100);
    await bid(carol, ids.lost, 110);
    await expire(ids.lost);
    await closeDueAuctions();

    ids.cancelled = await mk('Cancelled');
    await bid(bob, ids.cancelled, 100);
    await (await loginAs('admin')).post(`/api/auctions/${ids.cancelled}/cancel`);
  });

  it('gives each lot my bid count and what happened to my credit', async () => {
    const res = await (await loginAs('bob')).get('/api/me/bids');
    const by = Object.fromEntries((res.body.items as Item[]).map((i) => [i.auction.name, i]));
    expect(by.Leading).toMatchObject({ myStatus: 'winning', bidCount: 2, creditState: 'locked' });
    expect(by.Outbid).toMatchObject({ myStatus: 'outbid', bidCount: 1, creditState: 'released' });
    expect(by.Won).toMatchObject({ myStatus: 'won', bidCount: 1, creditState: 'charged' });
    expect(by.Lost).toMatchObject({ myStatus: 'lost', bidCount: 1, creditState: 'released' });
    expect(by.Cancelled).toMatchObject({ myStatus: 'cancelled', bidCount: 1, creditState: 'released' });
  });

  it('adds totals: every bid placed, and won / lost lots', async () => {
    const { totals } = (await (await loginAs('bob')).get('/api/me/bids')).body;
    expect(totals).toEqual({ bidsPlaced: 6, won: 1, lost: 1 });
    // carol: 3 bids, won 'Lost', still leads 'Outbid' (not finished)
    expect((await (await loginAs('carol')).get('/api/me/bids')).body.totals).toEqual({ bidsPlaced: 3, won: 1, lost: 1 });
  });
});
