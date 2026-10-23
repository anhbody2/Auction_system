import type http from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { creditPendingCount, goodsPendingCount } from '../src/lib/approvalEvents';
import { staffListenerCount } from '../src/lib/events';
import { app, loginAs, resetDb } from './helpers';
import { listen, loginCookie, settle, subscribe, waitFor } from './sse';
import { uploadTestImage, useTempUploadDir } from './upload.fixtures';

useTempUploadDir();

async function goodsBody(agent: request.Agent, name: string) {
  const category = await prisma.category.findFirstOrThrow({ orderBy: { id: 'asc' } });
  return { name, description: 'Goods sent for approval in the stf-009 tests.', categoryId: Number(category.id), condition: 'used', images: [await uploadTestImage(agent)] };
}

describe('stf-009 GET /api/staff/events: approval queues in real time', () => {
  let server: http.Server;
  let port: number;
  beforeAll(async () => {
    ({ server, port } = await listen());
  });
  afterAll(() => new Promise((r) => server.close(r)));
  beforeEach(resetDb);

  /** Opens the staff stream as the user and waits until the server listens on every channel it is allowed. */
  const streamFor = async (username: string, channels: ('goods' | 'credit')[]) => {
    const before = Object.fromEntries(channels.map((c) => [c, staffListenerCount(c)]));
    const sub = subscribe(port, '/api/staff/events', await loginCookie(username));
    expect((await sub.ready).status).toBe(200);
    await waitFor(() => channels.every((c) => staffListenerCount(c) > before[c]));
    return sub;
  };

  it('guests 401; users with neither goods.manage nor credit.manage 403', async () => {
    expect((await request(app).get('/api/staff/events')).status).toBe(401);
    const alice = await loginAs('alice');
    const res = await alice.get('/api/staff/events');
    expect(res.status).toBe(403);
  });

  it('each stream only gets the channels its user holds, checked at connect time', async () => {
    await prisma.rolePermission.deleteMany({ where: { role: 'staff', permission: { code: 'credit.manage' } } });
    const goodsOnly = await streamFor('staff', ['goods']);
    expect(staffListenerCount('credit')).toBe(0);
    const admin = await streamFor('admin', ['goods', 'credit']);

    const alice = await loginAs('alice');
    expect((await alice.post('/api/goods').send(await goodsBody(alice, 'Scoped lamp'))).status).toBe(201);
    expect((await alice.post('/api/credit/topup').send({ amount: 25 })).status).toBe(201);
    await waitFor(() => admin.events.length === 2);
    await settle();
    expect(goodsOnly.events.map((e) => e.event)).toEqual(['goods-request']);
    expect(admin.events.map((e) => e.event).sort()).toEqual(['credit-request', 'goods-request']);
    goodsOnly.close();
    admin.close();
  });

  it('goods: created, approved, rejected, resubmitted and deleted each publish one event with the pending count', async () => {
    const stream = await streamFor('staff', ['goods']);
    const alice = await loginAs('alice');
    const staff = await loginAs('staff');
    const base = await goodsPendingCount();
    const expectLast = async (n: number, data: Record<string, unknown>) => {
      await waitFor(() => stream.events.length === n);
      const last = stream.events.at(-1)!;
      expect(last.event).toBe('goods-request');
      expect(last.data).toMatchObject(data);
      expect(last.data.pendingCount).toBe(await goodsPendingCount());
    };

    const lamp = (await alice.post('/api/goods').send(await goodsBody(alice, 'Desk lamp'))).body.goods;
    await expectLast(1, { id: lamp.id, action: 'created', status: 'pending', name: 'Desk lamp', seller: 'alice', reviewedBy: null, pendingCount: base + 1 });

    expect((await staff.post(`/api/staff/goods/${lamp.id}/approve`)).status).toBe(200);
    await expectLast(2, { id: lamp.id, action: 'approved', status: 'active', reviewedBy: 'staff', pendingCount: base });

    const vase = (await alice.post('/api/goods').send(await goodsBody(alice, 'Glass vase'))).body.goods;
    await expectLast(3, { id: vase.id, action: 'created', pendingCount: base + 1 });
    expect((await staff.post(`/api/staff/goods/${vase.id}/reject`).send({ reason: 'Blurry photo' })).status).toBe(200);
    await expectLast(4, { id: vase.id, action: 'rejected', status: 'rejected', reviewedBy: 'staff', pendingCount: base });

    // Fixing rejected goods sends them back to the queue; an edit of pending goods publishes nothing.
    expect((await alice.patch(`/api/goods/${vase.id}`).send({ name: 'Glass vase (new photo)' })).status).toBe(200);
    await expectLast(5, { id: vase.id, action: 'resubmitted', status: 'pending', name: 'Glass vase (new photo)', pendingCount: base + 1 });
    expect((await alice.patch(`/api/goods/${vase.id}`).send({ name: 'Glass vase, blue' })).status).toBe(200);

    // Soft delete of pending goods (by the seller) leaves the queue.
    expect((await alice.delete(`/api/goods/${vase.id}`)).status).toBe(200);
    await expectLast(6, { id: vase.id, action: 'deleted', status: 'deleted', pendingCount: base });

    // Staff soft delete of pending goods too; deleting approved goods is not a queue change.
    const clock = (await alice.post('/api/goods').send(await goodsBody(alice, 'Wall clock'))).body.goods;
    await expectLast(7, { id: clock.id, action: 'created' });
    expect((await staff.delete(`/api/staff/goods/${clock.id}`)).status).toBe(200);
    await expectLast(8, { id: clock.id, action: 'deleted', reviewedBy: 'staff' });
    expect((await staff.delete(`/api/staff/goods/${lamp.id}`)).status).toBe(200);

    await settle();
    expect(stream.events).toHaveLength(8);
    expect(new Set(stream.events.map((e) => e.id)).size).toBe(8);
    stream.close();
  });

  it('credit: created, approved, rejected and cancelled each publish one event with the pending count', async () => {
    const stream = await streamFor('staff', ['credit']);
    const bob = await loginAs('bob');
    const staff = await loginAs('staff');
    const base = await creditPendingCount();
    const expectLast = async (n: number, data: Record<string, unknown>) => {
      await waitFor(() => stream.events.length === n);
      const last = stream.events.at(-1)!;
      expect(last.event).toBe('credit-request');
      expect(last.data).toMatchObject(data);
      expect(last.data.pendingCount).toBe(await creditPendingCount());
    };

    const top = (await bob.post('/api/credit/topup').send({ amount: 40 })).body.request;
    await expectLast(1, { id: top.id, action: 'created', status: 'pending', type: 'topup', amount: 40, customer: 'bob', reviewedBy: null, pendingCount: base + 1 });
    expect((await staff.post(`/api/staff/credit/requests/${top.id}/approve`)).status).toBe(200);
    await expectLast(2, { id: top.id, action: 'approved', status: 'posted', reviewedBy: 'staff', pendingCount: base });

    const out = (await bob.post('/api/credit/withdraw').send({ amount: 15 })).body.request;
    await expectLast(3, { id: out.id, action: 'created', type: 'withdraw', amount: 15 });
    expect((await staff.post(`/api/staff/credit/requests/${out.id}/reject`).send({ reason: 'Bank details missing' })).status).toBe(200);
    await expectLast(4, { id: out.id, action: 'rejected', status: 'rejected', reviewedBy: 'staff', pendingCount: base });

    // Staff soft delete of a pending request cancels it; deleting a rejected one is not a queue change.
    const again = (await bob.post('/api/credit/topup').send({ amount: 10 })).body.request;
    await expectLast(5, { id: again.id, action: 'created' });
    expect((await staff.delete(`/api/staff/credit/transactions/${again.id}`)).status).toBe(200);
    await expectLast(6, { id: again.id, action: 'cancelled', status: 'deleted', reviewedBy: 'staff', pendingCount: base });
    expect((await staff.delete(`/api/staff/credit/transactions/${out.id}`)).status).toBe(200);

    await settle();
    expect(stream.events).toHaveLength(6);
    stream.close();
  });

  it('a refused (400) review publishes nothing', async () => {
    const stream = await streamFor('admin', ['goods', 'credit']);
    const alice = await loginAs('alice');
    const staff = await loginAs('staff');
    const goods = (await alice.post('/api/goods').send(await goodsBody(alice, 'Old radio'))).body.goods;
    const top = (await alice.post('/api/credit/topup').send({ amount: 5 })).body.request;
    await staff.post(`/api/staff/goods/${goods.id}/approve`);
    await staff.post(`/api/staff/credit/requests/${top.id}/approve`);
    await waitFor(() => stream.events.length === 4);

    expect((await staff.post(`/api/staff/goods/${goods.id}/approve`)).status).toBe(400);
    expect((await staff.post(`/api/staff/goods/${goods.id}/reject`)).status).toBe(400);
    expect((await staff.post(`/api/staff/credit/requests/${top.id}/approve`)).status).toBe(400);
    expect((await staff.post(`/api/staff/credit/requests/${top.id}/reject`).send({ reason: 'late' })).status).toBe(400);
    await settle();
    expect(stream.events).toHaveLength(4);
    stream.close();
  });

  it('a closed stream stops listening', async () => {
    const stream = await streamFor('staff', ['goods', 'credit']);
    stream.close();
    await waitFor(() => staffListenerCount('goods') === 0 && staffListenerCount('credit') === 0);
  });
});
