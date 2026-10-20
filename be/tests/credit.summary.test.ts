import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { closeDueAuctions } from '../src/lib/settlement';
import { createAuction, loginAs, resetDb } from './helpers';

// Only the job settles here, so an ended-but-not-closed auction can be observed.
beforeAll(() => {
  process.env.SETTLE_ON_REQUEST = '0';
});
afterAll(() => {
  delete process.env.SETTLE_ON_REQUEST;
});

const summary = async (agent: request.Agent) => (await agent.get('/api/credit')).body;
const bid = (agent: request.Agent, auctionId: number, amount: number) => agent.post(`/api/auctions/${auctionId}/bids`).send({ amount });
const expire = (id: number) => prisma.auction.update({ where: { id: BigInt(id) }, data: { endTime: new Date(Date.now() - 1000) } });

describe('crd-002 Credit (balance) changes only at close; Locked credit (held) changes on bid and outbid', () => {
  beforeEach(resetDb);

  it('GET /api/credit returns balance and held; a bid or an outbid leaves balance alone until close', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { name: 'Glass Vase', initialPrice: 100 });

    expect(await summary(bob)).toMatchObject({ balance: 1000, held: 0 });
    expect((await bid(bob, a.id, 100)).status).toBe(201);
    expect(await summary(bob)).toMatchObject({ balance: 1000, held: 100 });

    expect((await bid(carol, a.id, 120)).status).toBe(201);
    expect(await summary(bob)).toMatchObject({ balance: 1000, held: 0 });
    expect(await summary(carol)).toMatchObject({ balance: 500, held: 120 });

    expect((await bid(bob, a.id, 200)).status).toBe(201);
    await expire(a.id);
    // Ended but not closed: still only locked.
    expect(await summary(bob)).toMatchObject({ balance: 1000, held: 200 });

    expect(await closeDueAuctions()).toBe(1);
    expect(await summary(bob)).toMatchObject({ balance: 800, held: 0 });
    expect(await summary(carol)).toMatchObject({ balance: 500, held: 0 });
  });

  it('ledger rows record the credit balance: hold and release rows keep it unchanged, payment lowers it', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { name: 'Tea Set', initialPrice: 100 });

    await bid(bob, a.id, 100);
    await bid(carol, a.id, 150);
    await bid(bob, a.id, 200);
    await expire(a.id);
    await closeDueAuctions();

    const rows = (await summary(bob)).transactions
      .slice()
      .reverse()
      .map((t: { transactionType: string; balanceBefore: number; balanceAfter: number }) => [t.transactionType, t.balanceBefore, t.balanceAfter]);
    expect(rows).toEqual([
      ['topup', 0, 1000], // seed
      ['hold', 1000, 1000],
      ['release', 1000, 1000],
      ['hold', 1000, 1000],
      ['payment', 1000, 800],
    ]);
  });

  it('a bid larger than credit minus locked credit is still refused', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { name: 'Lamp A', initialPrice: 100 });
    const b = await createAuction(alice, { name: 'Lamp B', initialPrice: 100 });

    await bid(bob, a.id, 900);
    const res = await bid(bob, b.id, 105);
    expect(res.status).toBe(400);
    expect(res.body.fields.amount).toBe('Bid exceeds your available credit');
    expect(await summary(bob)).toMatchObject({ balance: 1000, held: 900 });
  });
});
