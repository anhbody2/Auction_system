import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, loginAs, resetDb } from './helpers';

const DAY = 24 * 3600 * 1000;
const day = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const userId = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;

/** Inserts a ledger row directly so date, amount and text are controlled. */
async function row(username: string, opts: { amount: number; daysAgo?: number; description: string; auctionId?: number; type?: string }) {
  return prisma.creditTransaction.create({
    data: {
      userId: await userId(username),
      transactionType: opts.type ?? 'topup',
      amount: opts.amount,
      balanceBefore: 0,
      balanceAfter: 0,
      description: opts.description,
      auctionId: opts.auctionId ? BigInt(opts.auctionId) : null,
      createdAt: new Date(Date.now() - (opts.daysAgo ?? 0) * DAY),
    },
  });
}

type TxJson = { id: number; description: string; amount: number };
const ids = (body: { transactions: TxJson[] }) => body.transactions.map((t) => Number(t.id)).sort((a, b) => a - b);

describe('trx-001 GET /api/credit/transactions', () => {
  beforeEach(resetDb);

  async function seed() {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const lamp = await createAuction(alice, { name: 'Brass Lamp' });
    // createAuction writes no ledger rows; clear the seeded ones so only these rows exist for bob.
    await prisma.creditTransaction.deleteMany({ where: { userId: await userId('bob') } });
    const r = {
      top: await row('bob', { amount: 50, daysAgo: 1, description: 'Top up' }),
      bidLamp: await row('bob', { amount: 120, daysAgo: 2, description: 'Bid hold', type: 'hold', auctionId: lamp.id }),
      releaseLamp: await row('bob', { amount: 120, daysAgo: 3, description: 'Outbid', type: 'release', auctionId: lamp.id }),
      big: await row('bob', { amount: 900, daysAgo: 5, description: 'Top up' }),
      old: await row('bob', { amount: 60, daysAgo: 40, description: 'Top up' }),
      cents: await row('bob', { amount: 0.5, daysAgo: 1, description: 'Bid hold', type: 'hold' }),
      alices: await row('alice', { amount: 120, daysAgo: 1, description: 'Bid hold Brass Lamp', auctionId: lamp.id }),
    };
    return { alice, bob, r };
  }

  it('defaults to the last 30 days of the signed-in user, newest first, with paging totals', async () => {
    const { bob, r } = await seed();
    const res = await bob.get('/api/credit/transactions');
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual([r.top, r.bidLamp, r.releaseLamp, r.big, r.cents].map((x) => Number(x.id)).sort((a, b) => a - b));
    expect(res.body).toMatchObject({ total: 5, page: 1, pageSize: 20, from: day(-30), to: day(0) });
    expect(res.body.transactions[0].auction === null || typeof res.body.transactions[0].auction === 'object').toBe(true);

    const p1 = (await bob.get('/api/credit/transactions?pageSize=2&page=1')).body;
    const p3 = (await bob.get('/api/credit/transactions?pageSize=2&page=3')).body;
    expect(p1).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(p1.transactions).toHaveLength(2);
    expect(p3.transactions).toHaveLength(1);
  });

  it('each filter alone: name (auction name or description), id, amount range, date range', async () => {
    const { bob, r } = await seed();
    const q = async (qs: string) => ids((await bob.get(`/api/credit/transactions?${qs}`)).body);
    expect(await q('name=brass')).toEqual([Number(r.bidLamp.id), Number(r.releaseLamp.id)]);
    expect(await q('name=outbid')).toEqual([Number(r.releaseLamp.id)]);
    expect(await q(`id=${r.big.id}`)).toEqual([Number(r.big.id)]);
    expect(await q('min=100')).toEqual([r.bidLamp, r.releaseLamp, r.big].map((x) => Number(x.id)));
    expect(await q('min=1&max=100')).toEqual([Number(r.top.id)]);
    expect(await q(`from=${day(-4)}&to=${day(-2)}`)).toEqual([Number(r.bidLamp.id), Number(r.releaseLamp.id)]);
  });

  it('two or more filters narrow the result together (AND)', async () => {
    const { bob, r } = await seed();
    const q = async (qs: string) => ids((await bob.get(`/api/credit/transactions?${qs}`)).body);
    expect(await q('name=top up&min=100')).toEqual([Number(r.big.id)]);
    expect(await q(`name=brass&from=${day(-2)}&to=${day(0)}`)).toEqual([Number(r.bidLamp.id)]);
    expect(await q(`id=${r.big.id}&max=100`)).toEqual([]);
    expect(await q(`name=brass&min=100&max=200&id=${r.releaseLamp.id}&from=${day(-3)}&to=${day(-3)}`)).toEqual([Number(r.releaseLamp.id)]);
    expect(await q('name=hold&min=1')).toEqual([Number(r.bidLamp.id)]);
  });

  it('another user transaction never appears, even by id', async () => {
    const { bob, alice, r } = await seed();
    expect(ids((await bob.get(`/api/credit/transactions?id=${r.alices.id}`)).body)).toEqual([]);
    expect(ids((await bob.get('/api/credit/transactions?name=brass')).body)).not.toContain(Number(r.alices.id));
    const alices = ids((await alice.get('/api/credit/transactions')).body);
    expect(alices).toContain(Number(r.alices.id));
    for (const x of [r.top, r.bidLamp, r.releaseLamp, r.big, r.cents]) expect(alices).not.toContain(Number(x.id));
  });

  it('validation: dates within 30 days, min >= 1, max >= min; a missing max has no upper bound', async () => {
    const { bob, r } = await seed();
    const tooOld = await bob.get(`/api/credit/transactions?from=${day(-31)}`);
    expect(tooOld.status).toBe(400);
    expect(tooOld.body.fields.from).toBe('Date must be within the last 30 days');
    expect((await bob.get(`/api/credit/transactions?from=${day(-30)}`)).status).toBe(200);
    expect((await bob.get(`/api/credit/transactions?from=${day(-1)}&to=${day(-2)}`)).status).toBe(400);
    expect((await bob.get('/api/credit/transactions?from=2026-13-40')).status).toBe(400);
    expect((await bob.get(`/api/credit/transactions?to=${day(2)}`)).body.fields.to).toBe('To date cannot be in the future');

    const lowMin = await bob.get('/api/credit/transactions?min=0.5');
    expect(lowMin.status).toBe(400);
    expect(lowMin.body.fields.min).toBe('Minimum amount must be at least $1');
    const maxBelow = await bob.get('/api/credit/transactions?min=100&max=50');
    expect(maxBelow.status).toBe(400);
    expect(maxBelow.body.fields.max).toBe('Maximum amount must be at least the minimum');
    expect((await bob.get('/api/credit/transactions?id=abc')).status).toBe(400);

    // Blank max = unlimited
    expect(ids((await bob.get('/api/credit/transactions?min=500&max=')).body)).toEqual([Number(r.big.id)]);
    expect((await request(app).get('/api/credit/transactions')).status).toBe(401);
  });
});
