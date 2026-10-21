import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { getOutbox } from '../src/lib/mailer';
import { app, createAuction, loginAs, resetDb } from './helpers';
import { listen, loginCookie, subscribe, waitFor } from './sse';

const balances = async (username: string) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { username } });
  return { balance: u.creditBalance.toNumber(), held: u.heldBalance.toNumber() };
};
const R = '/api/staff/credit/requests';

describe('stf-007 top-up and withdrawal requests wait for staff approval', () => {
  beforeEach(resetDb);

  it('a top-up is pending with the balance unchanged; approve adds it and posts the ledger row', async () => {
    const bob = await loginAs('bob');
    const before = await balances('bob');
    const req = await bob.post('/api/credit/topup').send({ amount: 50 });
    expect(req.status).toBe(201);
    expect(req.body.request).toMatchObject({ status: 'pending', transactionType: 'topup', amount: 50 });
    expect(await balances('bob')).toEqual(before);
    expect(req.body.pending.map((p: { id: number }) => p.id)).toEqual([req.body.request.id]);

    const staff = await loginAs('staff');
    expect((await staff.get(R)).body.requests.map((r: { id: number; user: { username: string } }) => [r.id, r.user.username])).toEqual([[req.body.request.id, 'bob']]);
    const ok = await staff.post(`${R}/${req.body.request.id}/approve`);
    expect(ok.status).toBe(200);
    expect(await balances('bob')).toEqual({ ...before, balance: before.balance + 50 });
    const row = await prisma.creditTransaction.findUniqueOrThrow({ where: { id: BigInt(req.body.request.id) } });
    expect(row).toMatchObject({ status: 'posted', description: 'Top up' });
    expect([row.balanceBefore.toNumber(), row.balanceAfter.toNumber()]).toEqual([before.balance, before.balance + 50]);
    expect(row.reviewedById).toBe((await prisma.user.findUniqueOrThrow({ where: { username: 'staff' } })).id);
    expect(getOutbox('bob@example.com').at(-1)?.subject).toBe('Your credit request was approved');
    expect((await bob.get('/api/credit')).body.pending).toEqual([]);
  });

  it('reject needs a reason, stores it, changes nothing and mails the customer', async () => {
    const bob = await loginAs('bob');
    const before = await balances('bob');
    const req = await bob.post('/api/credit/topup').send({ amount: 80 });
    const staff = await loginAs('staff');
    const noReason = await staff.post(`${R}/${req.body.request.id}/reject`).send({});
    expect(noReason.status).toBe(400);
    expect(noReason.body.fields.reason).toBe('Give a reason for the rejection');
    const res = await staff.post(`${R}/${req.body.request.id}/reject`).send({ reason: 'Payment not received' });
    expect(res.status).toBe(200);
    expect(await balances('bob')).toEqual(before);
    expect(await prisma.creditTransaction.findUniqueOrThrow({ where: { id: BigInt(req.body.request.id) } })).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Payment not received',
    });
    const mail = getOutbox('bob@example.com').at(-1)!;
    expect(mail.subject).toBe('Your credit request was rejected');
    expect(mail.text).toContain('Reason: Payment not received');
  });

  it('a withdrawal larger than available credit at approval time is refused and stays pending; reviewing twice is 400', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const staff = await loginAs('staff');
    const { balance } = await balances('bob');
    const req = await bob.post('/api/credit/withdraw').send({ amount: balance - 100 });
    expect(req.status).toBe(201);
    // Meanwhile bob locks credit in a bid, so the withdrawal no longer fits.
    const a = await createAuction(alice, { initialPrice: 200 });
    expect((await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 200 })).status).toBe(201);

    const refused = await staff.post(`${R}/${req.body.request.id}/approve`);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('The customer does not have enough available credit for this withdrawal');
    expect((await prisma.creditTransaction.findUniqueOrThrow({ where: { id: BigInt(req.body.request.id) } })).status).toBe('pending');
    expect((await balances('bob')).balance).toBe(balance);

    const small = await bob.post('/api/credit/withdraw').send({ amount: 10 });
    expect((await staff.post(`${R}/${small.body.request.id}/approve`)).status).toBe(200);
    expect((await balances('bob')).balance).toBe(balance - 10);
    const twice = await staff.post(`${R}/${small.body.request.id}/approve`);
    expect(twice.status).toBe(400);
    expect(twice.body.error).toBe('Only pending requests can be approved or rejected');
    expect((await staff.post(`${R}/${small.body.request.id}/reject`).send({ reason: 'x' })).status).toBe(400);
    expect((await balances('bob')).balance).toBe(balance - 10);
  });

  it('two staff approving the same request at once: exactly one succeeds and the balance changes once', async () => {
    const bob = await loginAs('bob');
    const before = await balances('bob');
    const req = await bob.post('/api/credit/topup').send({ amount: 40 });
    const [s1, s2] = [await loginAs('staff'), await loginAs('admin')];
    const results = await Promise.all([s1.post(`${R}/${req.body.request.id}/approve`), s2.post(`${R}/${req.body.request.id}/approve`)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await balances('bob')).balance).toBe(before.balance + 40);
  });

  it('the customer stream gets a credit-request event with the new balance', async () => {
    const bob = await loginAs('bob');
    const req = await bob.post('/api/credit/topup').send({ amount: 25 });
    const { server, port } = await listen();
    const stream = subscribe(port, '/api/me/events', await loginCookie('bob'));
    try {
      expect((await stream.ready).status).toBe(200);
      await (await loginAs('staff')).post(`${R}/${req.body.request.id}/approve`);
      await waitFor(() => stream.events.some((e) => e.event === 'credit-request'));
      const data = stream.events.find((e) => e.event === 'credit-request')!.data;
      expect(data).toMatchObject({ id: req.body.request.id, status: 'posted', balance: (await balances('bob')).balance });
    } finally {
      stream.close();
      server.close();
    }
  });

  it('customers get 403 on approve/reject and the request list; guests 401', async () => {
    const bob = await loginAs('bob');
    const req = await bob.post('/api/credit/topup').send({ amount: 25 });
    for (const path of [`${R}/${req.body.request.id}/approve`, `${R}/${req.body.request.id}/reject`]) expect((await bob.post(path)).status).toBe(403);
    expect((await bob.get(R)).status).toBe(403);
    expect((await request(app).get(R)).status).toBe(401);
  });
});
