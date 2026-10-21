import { beforeAll, describe, expect, it } from 'vitest';
import { loginAs, registerUser, resetDb } from './helpers';

/** stf-007: staff approve a request by id. */
const approve = async (id: number) => (await loginAs('staff')).post(`/api/staff/credit/requests/${id}/approve`);

describe('cust-005 credit account', () => {
  beforeAll(async () => {
    await resetDb();
    await registerUser('wallet');
  });

  it('shows zero balance and empty history for a new account', async () => {
    const agent = await loginAs('wallet');
    const res = await agent.get('/api/credit');
    expect(res.body).toMatchObject({ balance: 0, held: 0, available: 0, transactions: [] });
  });

  it('tops up, rejects over-withdrawal, withdraws, and records each movement (each approved by staff, stf-007)', async () => {
    const agent = await loginAs('wallet');
    const top = await agent.post('/api/credit/topup').send({ amount: 250.5 });
    expect(top.status).toBe(201);
    expect(top.body.balance).toBe(0); // pending until approved
    expect((await approve(top.body.request.id)).status).toBe(200);
    expect((await agent.get('/api/credit')).body.balance).toBe(250.5);

    const tooMuch = await agent.post('/api/credit/withdraw').send({ amount: 1000 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.fields.amount).toBe('Amount exceeds your available credit');

    const req = await agent.post('/api/credit/withdraw').send({ amount: 50.5 });
    expect(req.status).toBe(201);
    expect((await approve(req.body.request.id)).status).toBe(200);
    const ok = await agent.get('/api/credit');
    expect(ok.body.available).toBe(200);

    const txs = ok.body.transactions;
    expect(txs).toHaveLength(2);
    expect(txs[0]).toMatchObject({ transactionType: 'withdraw', amount: 50.5, balanceBefore: 250.5, balanceAfter: 200 });
    expect(txs[1]).toMatchObject({ transactionType: 'topup', amount: 250.5, balanceBefore: 0, balanceAfter: 250.5 });
  });

  it('validates amounts', async () => {
    const agent = await loginAs('wallet');
    for (const amount of [0, -5, 'abc', 1.234]) {
      const res = await agent.post('/api/credit/topup').send({ amount });
      expect(res.status, `amount ${amount}`).toBe(400);
    }
  });

  it('serialises concurrent withdrawal approvals so the balance never goes negative', async () => {
    const agent = await loginAs('wallet');
    // 200 available: five requests of 60 are each fine on their own; only three can be paid out.
    const requests = await Promise.all(Array.from({ length: 5 }, () => agent.post('/api/credit/withdraw').send({ amount: 60 })));
    expect(requests.every((r) => r.status === 201)).toBe(true);
    const staff = await loginAs('staff');
    const results = await Promise.all(requests.map((r) => staff.post(`/api/staff/credit/requests/${r.body.request.id}/approve`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(results.filter((r) => r.status === 400)).toHaveLength(2);
    const after = await agent.get('/api/credit');
    expect(after.body.available).toBe(20);
    expect(after.body.pending).toHaveLength(2);
  });
});
