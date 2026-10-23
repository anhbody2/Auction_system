import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, loginAs, resetDb } from './helpers';

describe('stf-009 GET /api/staff/pending-counts', () => {
  beforeEach(resetDb);

  const pendingGoods = () => prisma.goods.count({ where: { status: 'pending' } });
  const pendingCredit = () => prisma.creditTransaction.count({ where: { status: 'pending', transactionType: { in: ['topup', 'withdraw'] } } });

  it('guests 401; customers 403', async () => {
    expect((await request(app).get('/api/staff/pending-counts')).status).toBe(401);
    expect((await (await loginAs('alice')).get('/api/staff/pending-counts')).status).toBe(403);
  });

  it('counts pending goods and pending credit requests', async () => {
    const bob = await loginAs('bob');
    await bob.post('/api/credit/topup').send({ amount: 30 });
    await bob.post('/api/credit/withdraw').send({ amount: 10 });
    const seller = await prisma.user.findUniqueOrThrow({ where: { username: 'alice' } });
    const category = await prisma.category.findFirstOrThrow();
    await prisma.goods.create({ data: { sellerId: seller.id, categoryId: category.id, name: 'Queued kettle', status: 'pending' } });

    const res = await (await loginAs('staff')).get('/api/staff/pending-counts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ goods: await pendingGoods(), credit: await pendingCredit() });
    expect(res.body.credit).toBeGreaterThanOrEqual(2);
    expect(res.body.goods).toBeGreaterThanOrEqual(1);
  });

  it('each count only with its permission', async () => {
    await prisma.rolePermission.deleteMany({ where: { role: 'staff', permission: { code: 'goods.manage' } } });
    const res = await (await loginAs('staff')).get('/api/staff/pending-counts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ credit: await pendingCredit() });
  });
});
