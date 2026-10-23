import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { createAuction, loginAs, resetDb } from './helpers';

const DAY = 24 * 3600 * 1000;
const day = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const userId = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;

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

type TxJson = { id: number };
const ids = (body: { transactions: TxJson[] }) => body.transactions.map((t) => Number(t.id)).sort((a, b) => a - b);

describe('ui-3b.2 GET /api/credit/transactions: q and type', () => {
  let r: Record<string, { id: bigint }>;
  let bob: Awaited<ReturnType<typeof loginAs>>;
  const get = async (query: string) => bob.get(`/api/credit/transactions?tz=0&${query}`);
  const found = async (query: string) => ids((await get(query)).body);
  const idsOf = (...keys: string[]) => keys.map((k) => Number(r[k].id)).sort((a, b) => a - b);

  beforeAll(async () => {
    await resetDb();
    const alice = await loginAs('alice');
    bob = await loginAs('bob');
    const lamp = await createAuction(alice, { name: 'Brass Lamp' });
    await prisma.creditTransaction.deleteMany({ where: { userId: await userId('bob') } });
    r = {
      top: await row('bob', { amount: 50, daysAgo: 1, description: 'Top up' }),
      hold: await row('bob', { amount: 120, daysAgo: 2, description: 'Bid hold', type: 'hold', auctionId: lamp.id }),
      release: await row('bob', { amount: 120, daysAgo: 3, description: 'Outbid', type: 'release', auctionId: lamp.id }),
      payment: await row('bob', { amount: 75.5, daysAgo: 4, description: 'Won Oak table', type: 'payment' }),
      old: await row('bob', { amount: 50, daysAgo: 40, description: 'Top up' }),
      alices: await row('alice', { amount: 50, daysAgo: 1, description: 'Top up' }),
    };
  });

  it('q matches the auction name or the description, any case', async () => {
    expect(await found('q=brass')).toEqual(idsOf('hold', 'release'));
    expect(await found('q=OAK')).toEqual(idsOf('payment'));
  });

  it('q matches the transaction id (with or without #) and the amount when it is a number', async () => {
    expect(await found(`q=${r.payment.id}`)).toEqual(idsOf('payment'));
    expect(await found(`q=%23${r.top.id}`)).toEqual(idsOf('top'));
    expect(await found('q=120')).toEqual(idsOf('hold', 'release'));
    // '#' means a transaction id only: #120 does not match the $120 rows (ids here are small).
    expect(await found('q=%23120')).toEqual([]);
    expect(await found('q=75.50')).toEqual(idsOf('payment'));
    expect(await found('q=%2475.5')).toEqual(idsOf('payment'));
  });

  it('type filters by one or several types; unknown types are refused', async () => {
    expect(await found('type=hold')).toEqual(idsOf('hold'));
    expect(await found('type=hold,release,payment')).toEqual(idsOf('hold', 'release', 'payment'));
    const bad = await get('type=hold,gift');
    expect(bad.status).toBe(400);
  });

  it('combines with each other and with dates; the 30-day window and the user stay enforced', async () => {
    expect(await found('q=120&type=release')).toEqual(idsOf('release'));
    expect(await found(`q=brass&from=${day(-2)}&to=${day(0)}`)).toEqual(idsOf('hold'));
    // The 40-day-old top-up and alice's top-up never show
    expect(await found('q=50')).toEqual(idsOf('top'));
    expect((await get(`q=50&from=${day(-40)}`)).status).toBe(400);
  });

  it('the old name / id / min / max params still work', async () => {
    expect(await found('name=brass&min=100&max=130')).toEqual(idsOf('hold', 'release'));
    expect(await found(`id=${r.top.id}`)).toEqual(idsOf('top'));
  });
});
