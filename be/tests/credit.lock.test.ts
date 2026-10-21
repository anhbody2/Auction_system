import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { createAuction, loginAs, resetDb, topUp } from './helpers';

const credit = async (agent: request.Agent) => {
  const { balance, held, available } = (await agent.get('/api/credit')).body;
  return { balance, held, available };
};
const bid = (agent: request.Agent, auctionId: number, amount: number) => agent.post(`/api/auctions/${auctionId}/bids`).send({ amount });

/** held_balance must always equal the sum of the user's leading ('active') bid tickets. */
async function expectHeldMatchesActiveTickets(username: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { username } });
  const active = await prisma.bidTicket.aggregate({ where: { bidderId: user.id, status: 'active' }, _sum: { amount: true } });
  expect(user.heldBalance.toNumber()).toBe(active._sum.amount?.toNumber() ?? 0);
}

describe('crd-001 only the leading bid locks credit', () => {
  beforeEach(resetDb);

  it('an outbid bidder gets their locked credit back at once, recorded in the ledger; no money leaves anyone', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { name: 'Brass Lamp', initialPrice: 100 });

    expect((await bid(bob, a.id, 100)).status).toBe(201);
    expect(await credit(bob)).toEqual({ balance: 1000, held: 100, available: 900 });

    expect((await bid(carol, a.id, 120)).status).toBe(201);
    expect(await credit(bob)).toEqual({ balance: 1000, held: 0, available: 1000 });
    expect(await credit(carol)).toEqual({ balance: 500, held: 120, available: 380 });

    const bobId = (await prisma.user.findUniqueOrThrow({ where: { username: 'bob' } })).id;
    const ledger = await prisma.creditTransaction.findMany({ where: { userId: bobId, auctionId: BigInt(a.id) }, orderBy: { id: 'asc' } });
    expect(ledger.map((t) => [t.transactionType, t.amount.toNumber(), t.description])).toEqual([
      ['hold', 100, 'Bid on Brass Lamp'],
      ['release', 100, 'Outbid on Brass Lamp'],
    ]);
    await expectHeldMatchesActiveTickets('bob');
    await expectHeldMatchesActiveTickets('carol');
  });

  it('released credit can be bid elsewhere straight away, before the first auction closes', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const a = await createAuction(alice, { name: 'Clock A', initialPrice: 100 });
    const b = await createAuction(alice, { name: 'Clock B', initialPrice: 200 });

    await bid(bob, a.id, 900);
    const tooMuch = await bid(bob, b.id, 200);
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.fields.amount).toBe('Bid exceeds your available credit');

    await topUp(carol, 500);
    expect((await bid(carol, a.id, 950)).status).toBe(201);

    expect((await bid(bob, b.id, 200)).status).toBe(201);
    expect(await credit(bob)).toEqual({ balance: 1000, held: 200, available: 800 });
  });

  it('a leader raising their own bid locks only the new amount', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { initialPrice: 100 });

    await bid(bob, a.id, 100);
    expect((await bid(bob, a.id, 150)).status).toBe(201);
    expect(await credit(bob)).toEqual({ balance: 1000, held: 150, available: 850 });
    expect(await prisma.bidTicket.count({ where: { auctionId: BigInt(a.id), status: 'active' } })).toBe(1);
    await expectHeldMatchesActiveTickets('bob');
  });

  it('across several open auctions, locked credit is the sum of the auctions the user leads', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const carol = await loginAs('carol');
    const leadA = await createAuction(alice, { name: 'Lead A', initialPrice: 100 });
    const leadB = await createAuction(alice, { name: 'Lead B', initialPrice: 200 });
    const lost = await createAuction(alice, { name: 'Lost C', initialPrice: 100 });

    await bid(bob, leadA.id, 100);
    await bid(bob, leadB.id, 200);
    await bid(bob, lost.id, 100);
    expect((await credit(bob)).held).toBe(400);

    await bid(carol, lost.id, 120);
    expect(await credit(bob)).toEqual({ balance: 1000, held: 300, available: 700 });
    await expectHeldMatchesActiveTickets('bob');
  });
});
