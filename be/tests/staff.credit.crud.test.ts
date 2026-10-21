import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { createAuction, loginAs, resetDb, topUp } from './helpers';

const BASE = '/api/staff/credit/transactions';
const balances = async (username: string) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { username } });
  return { balance: u.creditBalance.toNumber(), held: u.heldBalance.toNumber() };
};

describe('stf-008 staff view, adjust, edit, delete and reverse transactions', () => {
  beforeEach(resetDb);

  it('manual credit and debit adjustments post at once with type adjustment and the reason', async () => {
    const staff = await loginAs('staff');
    const before = await balances('carol');
    const credit = await staff.post(BASE).send({ customer: 'carol', direction: 'credit', amount: 20, reason: 'Goodwill for a late delivery' });
    expect(credit.status).toBe(201);
    expect(credit.body.transaction).toMatchObject({ transactionType: 'adjustment', status: 'posted', amount: 20, direction: 'credit', description: 'Adjustment: Goodwill for a late delivery' });
    expect(await balances('carol')).toEqual({ ...before, balance: before.balance + 20 });

    const debit = await staff.post(BASE).send({ customer: 'carol', direction: 'debit', amount: 5, reason: 'Fee correction' });
    expect(debit.status).toBe(201);
    expect(debit.body.transaction.direction).toBe('debit');
    expect((await balances('carol')).balance).toBe(before.balance + 15);

    const tooMuch = await staff.post(BASE).send({ customer: 'carol', direction: 'debit', amount: 1_000_000, reason: 'Too much' });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.fields.amount).toBe("Debit exceeds the customer's available credit");
    const noReason = await staff.post(BASE).send({ customer: 'carol', direction: 'credit', amount: 5 });
    expect(noReason.status).toBe(400);
    expect(noReason.body.fields.reason).toBeTruthy();
    expect((await staff.post(BASE).send({ customer: 'staff', direction: 'credit', amount: 5, reason: 'Not a customer' })).status).toBe(400);
    expect((await balances('carol')).balance).toBe(before.balance + 15);
  });

  it('views a transaction with user, auction, bid and balances', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const a = await createAuction(alice, { name: 'Ledger Lamp' });
    await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    const hold = await prisma.creditTransaction.findFirstOrThrow({ where: { auctionId: BigInt(a.id), transactionType: 'hold' } });
    const res = await (await loginAs('staff')).get(`${BASE}/${hold.id}`);
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({ user: { username: 'bob' }, auction: { id: a.id, name: 'Ledger Lamp' }, bidTicket: { amount: 100 }, reversedBy: null });
    expect(typeof res.body.transaction.balanceBefore).toBe('number');
  });

  it('edits a pending amount and any description; a posted amount is 400', async () => {
    const bob = await loginAs('bob');
    const staff = await loginAs('staff');
    const req = await bob.post('/api/credit/topup').send({ amount: 30 });
    const id = req.body.request.id;
    const ok = await staff.patch(`${BASE}/${id}`).send({ amount: 45, description: 'Top up request (corrected)' });
    expect(ok.status).toBe(200);
    expect(ok.body.transaction).toMatchObject({ amount: 45, status: 'pending' });
    // Approval uses the edited amount.
    const before = await balances('bob');
    await staff.post(`/api/staff/credit/requests/${id}/approve`);
    expect((await balances('bob')).balance).toBe(before.balance + 45);

    const posted = await staff.patch(`${BASE}/${id}`).send({ amount: 10 });
    expect(posted.status).toBe(400);
    expect(posted.body.error).toBe('Only the amount of a pending request can be changed; reverse posted transactions instead');
    expect((await staff.patch(`${BASE}/${id}`).send({ description: 'Top up via bank' })).status).toBe(200);
    expect((await staff.patch(`${BASE}/${id}`).send({ userId: 1 })).status).toBe(400);
  });

  it('soft-deletes pending and rejected requests (row kept); posted rows cannot be deleted', async () => {
    const bob = await loginAs('bob');
    const staff = await loginAs('staff');
    const pending = (await bob.post('/api/credit/topup').send({ amount: 30 })).body.request.id;
    const rejected = (await bob.post('/api/credit/topup').send({ amount: 40 })).body.request.id;
    await staff.post(`/api/staff/credit/requests/${rejected}/reject`).send({ reason: 'No payment' });
    const posted = (await topUp(bob, 10)).id;

    for (const id of [pending, rejected]) {
      expect((await staff.delete(`${BASE}/${id}`)).status).toBe(200);
      expect((await prisma.creditTransaction.findUniqueOrThrow({ where: { id: BigInt(id) } })).status).toBe('deleted');
    }
    // Hidden from the customer, kept for staff under Deleted; a deleted request cannot be approved.
    expect((await bob.get('/api/credit/transactions')).body.transactions.map((t: { id: number }) => t.id)).not.toContain(pending);
    expect((await bob.get('/api/credit')).body.pending).toEqual([]);
    expect((await staff.get(`${BASE}?status=deleted`)).body.transactions.map((t: { id: number }) => t.id).sort()).toEqual([pending, rejected].sort());
    expect((await staff.post(`/api/staff/credit/requests/${pending}/approve`)).status).toBe(400);

    const refused = await staff.delete(`${BASE}/${posted}`);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('Posted transactions cannot be deleted; reverse them instead');
    expect((await staff.delete(`${BASE}/${pending}`)).status).toBe(404);
  });

  it('reverse posts the opposite amount once; bid and settlement rows cannot be reversed', async () => {
    const carol = await loginAs('carol');
    const staff = await loginAs('staff');
    const start = (await balances('carol')).balance;
    const top = await topUp(carol, 25);
    expect((await balances('carol')).balance).toBe(start + 25);

    const rev = await staff.post(`${BASE}/${top.id}/reverse`);
    expect(rev.status).toBe(201);
    expect(rev.body.transaction).toMatchObject({ transactionType: 'adjustment', direction: 'debit', amount: 25 });
    expect(rev.body.transaction.description).toMatch(new RegExp(`^Reversal of #${top.id}:`));
    expect((await balances('carol')).balance).toBe(start);
    expect((await staff.get(`${BASE}/${top.id}`)).body.transaction.reversedBy).toBe(rev.body.transaction.id);
    const again = await staff.post(`${BASE}/${top.id}/reverse`);
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('This transaction has already been reversed');
    expect((await staff.post(`${BASE}/${rev.body.transaction.id}/reverse`)).status).toBe(400);

    // A debit adjustment reverses into a credit.
    const debit = (await staff.post(BASE).send({ customer: 'carol', direction: 'debit', amount: 7, reason: 'Fee' })).body.transaction;
    const back = await staff.post(`${BASE}/${debit.id}/reverse`);
    expect(back.body.transaction.direction).toBe('credit');
    expect((await balances('carol')).balance).toBe(start);

    // Holds (bids) cannot be reversed; pending requests neither.
    const alice = await loginAs('alice');
    const a = await createAuction(alice);
    await carol.post(`/api/auctions/${a.id}/bids`).send({ amount: 100 });
    const hold = await prisma.creditTransaction.findFirstOrThrow({ where: { auctionId: BigInt(a.id), transactionType: 'hold' } });
    expect((await staff.post(`${BASE}/${hold.id}/reverse`)).status).toBe(400);
    const pending = (await carol.post('/api/credit/topup').send({ amount: 5 })).body.request.id;
    expect((await staff.post(`${BASE}/${pending}/reverse`)).status).toBe(400);
  });
});
