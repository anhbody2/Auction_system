import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, loginAs, resetDb } from './helpers';

const BASE = '/api/staff/credit/transactions';
const DAY = 24 * 3600 * 1000;
const userId = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;

async function row(username: string, opts: { amount: number; daysAgo?: number; description: string; status?: string; type?: string }) {
  return prisma.creditTransaction.create({
    data: {
      userId: await userId(username),
      transactionType: opts.type ?? 'topup',
      amount: opts.amount,
      balanceBefore: 0,
      balanceAfter: 0,
      description: opts.description,
      status: opts.status ?? 'posted',
      createdAt: new Date(Date.now() - (opts.daysAgo ?? 0) * DAY),
    },
  });
}
type T = { id: number };
const ids = (body: { transactions: T[] }) => body.transactions.map((t) => Number(t.id)).sort((a, b) => a - b);
const sorted = (...rows: { id: bigint }[]) => rows.map((r) => Number(r.id)).sort((a, b) => a - b);

describe('stf-008 GET /api/staff/credit/transactions', () => {
  beforeEach(resetDb);

  async function seed() {
    await prisma.creditTransaction.deleteMany();
    const r = {
      bobTop: await row('bob', { amount: 50, daysAgo: 1, description: 'Top up' }),
      bobPending: await row('bob', { amount: 75, description: 'Top up request', status: 'pending' }),
      bobRejected: await row('bob', { amount: 300, daysAgo: 2, description: 'Top up request', status: 'rejected' }),
      bobDeleted: await row('bob', { amount: 20, description: 'Top up request', status: 'deleted' }),
      carolTop: await row('carol', { amount: 500, daysAgo: 3, description: 'Top up' }),
      carolWithdraw: await row('carol', { amount: 60, daysAgo: 1, description: 'Withdrawal', type: 'withdraw' }),
      old: await row('carol', { amount: 99, daysAgo: 45, description: 'Top up' }),
    };
    return { staff: await loginAs('staff'), r };
  }

  it('lists every customer (not deleted) for the last 30 days with user names and totals', async () => {
    const { staff, r } = await seed();
    const res = await staff.get(BASE);
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(sorted(r.bobTop, r.bobPending, r.bobRejected, r.carolTop, r.carolWithdraw));
    expect(res.body.total).toBe(5);
    expect(res.body.transactions.find((t: T) => Number(t.id) === Number(r.carolTop.id)).user.username).toBe('carol');
  });

  it('customer and status filters, alone and combined with the trx-001 filters (AND)', async () => {
    const { staff, r } = await seed();
    const q = async (qs: string) => ids((await staff.get(`${BASE}?${qs}`)).body);
    expect(await q('customer=bob')).toEqual(sorted(r.bobTop, r.bobPending, r.bobRejected));
    expect(await q('status=pending')).toEqual(sorted(r.bobPending));
    expect(await q('status=deleted')).toEqual(sorted(r.bobDeleted));
    expect(await q('customer=carol&min=100')).toEqual(sorted(r.carolTop));
    expect(await q('customer=bob&status=posted&max=60')).toEqual(sorted(r.bobTop));
    expect(await q('name=withdrawal&customer=carol')).toEqual(sorted(r.carolWithdraw));
    expect(await q(`id=${r.carolTop.id}&customer=bob`)).toEqual([]);
    const from = new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10);
    expect(await q(`from=${from}&customer=bob&min=100`)).toEqual(sorted(r.bobRejected));
    expect((await staff.get(`${BASE}?min=0.5`)).status).toBe(400);
  });

  it('pages with totals', async () => {
    const { staff } = await seed();
    const p1 = (await staff.get(`${BASE}?pageSize=2`)).body;
    const p3 = (await staff.get(`${BASE}?pageSize=2&page=3`)).body;
    expect(p1).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(p1.transactions).toHaveLength(2);
    expect(p3.transactions).toHaveLength(1);
  });

  it('customers get 403 on every /api/staff/credit route; guests 401', async () => {
    const bob = await loginAs('bob');
    expect((await request(app).get(BASE)).status).toBe(401);
    const routes = [
      ['get', BASE],
      ['get', `${BASE}/1`],
      ['post', BASE],
      ['patch', `${BASE}/1`],
      ['delete', `${BASE}/1`],
      ['post', `${BASE}/1/reverse`],
      ['get', '/api/staff/credit/requests'],
    ] as const;
    for (const [method, path] of routes) expect((await bob[method](path)).status, `${method} ${path}`).toBe(403);
  });
});
