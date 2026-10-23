import type http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { userListenerCount } from '../src/lib/events';
import { loginAs, resetDb } from './helpers';
import { listen, loginCookie, settle, subscribe, waitFor } from './sse';

const userId = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;

describe('stf-010 goods-reviewed reaches the seller in real time', () => {
  let server: http.Server;
  let port: number;
  beforeAll(async () => {
    ({ server, port } = await listen());
  });
  afterAll(() => new Promise((r) => server.close(r)));
  beforeEach(resetDb);

  const streamFor = async (username: string) => {
    const sub = subscribe(port, '/api/me/events', await loginCookie(username));
    expect((await sub.ready).status).toBe(200);
    const id = await userId(username);
    await waitFor(() => userListenerCount(id) >= 1);
    return sub;
  };

  /** Pending goods of `username`, straight in the DB (the create route is covered elsewhere). */
  const pendingGoods = async (username: string, name: string) => {
    const category = await prisma.category.findFirstOrThrow();
    return prisma.goods.create({ data: { sellerId: await userId(username), categoryId: category.id, name, status: 'pending' } });
  };

  it('approve and reject each send one goods-reviewed event to the seller only', async () => {
    const alice = await streamFor('alice');
    const bob = await streamFor('bob');
    const staff = await loginAs('staff');
    const lamp = await pendingGoods('alice', 'Brass lamp');
    const vase = await pendingGoods('alice', 'Glass vase');

    expect((await staff.post(`/api/staff/goods/${lamp.id}/approve`)).status).toBe(200);
    await waitFor(() => alice.events.length === 1);
    expect(alice.events[0]).toMatchObject({ event: 'goods-reviewed', data: { id: Number(lamp.id), name: 'Brass lamp', status: 'approved', reason: null } });

    expect((await staff.post(`/api/staff/goods/${vase.id}/reject`).send({ reason: 'Photo is blurry' })).status).toBe(200);
    await waitFor(() => alice.events.length === 2);
    expect(alice.events[1]).toMatchObject({ event: 'goods-reviewed', data: { id: Number(vase.id), status: 'rejected', reason: 'Photo is blurry' } });
    expect(alice.events[0].id).not.toBe(alice.events[1].id);

    // Sent after commit: the stored status is already the decision.
    expect((await prisma.goods.findUniqueOrThrow({ where: { id: vase.id } })).status).toBe('rejected');
    await settle();
    expect(alice.events).toHaveLength(2);
    expect(bob.events).toHaveLength(0);
    alice.close();
    bob.close();
  });

  it('a refused (400) review sends nothing', async () => {
    const alice = await streamFor('alice');
    const staff = await loginAs('staff');
    const lamp = await pendingGoods('alice', 'Desk lamp');
    await staff.post(`/api/staff/goods/${lamp.id}/approve`);
    await waitFor(() => alice.events.length === 1);
    expect((await staff.post(`/api/staff/goods/${lamp.id}/approve`)).status).toBe(400);
    expect((await staff.post(`/api/staff/goods/${lamp.id}/reject`).send({ reason: 'late' })).status).toBe(400);
    await settle();
    expect(alice.events).toHaveLength(1);
    alice.close();
  });

  it('a rejected credit request event carries the reason (toast text)', async () => {
    const alice = await streamFor('alice');
    const customer = await loginAs('alice');
    const staff = await loginAs('staff');
    const req = (await customer.post('/api/credit/topup').send({ amount: 12 })).body.request;
    expect((await staff.post(`/api/staff/credit/requests/${req.id}/reject`).send({ reason: 'Card declined' })).status).toBe(200);
    await waitFor(() => alice.events.length === 1);
    expect(alice.events[0]).toMatchObject({ event: 'credit-request', data: { id: req.id, status: 'rejected', type: 'topup', reason: 'Card declined' } });
    alice.close();
  });
});
