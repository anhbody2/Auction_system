import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { applyCredit } from '../lib/credit';
import { lockTransaction, reviewCredit } from '../lib/creditRequests';
import { publishUserEvent } from '../lib/events';
import { HttpError, asyncHandler } from '../lib/http';
import { directionOf, searchTransactions, transactionFilterSchema, withDirection } from '../lib/transactions';
import { moneyField } from '../lib/validation';
import { requirePermission } from '../middleware/auth';

/** stf-007 (and stf-008) Staff - Credit Management. Mounted at /api/staff/credit; every route needs credit.manage. */
export const staffCreditRouter = Router();
staffCreditRouter.use(requirePermission('credit.manage'));

const idParam = (raw: string) => {
  if (!/^\d{1,18}$/.test(raw)) throw new HttpError(404, 'Transaction not found');
  return BigInt(raw);
};
const userSelect = { select: { id: true, username: true } } as const;

/** Requests waiting for approval, oldest first. */
staffCreditRouter.get(
  '/requests',
  asyncHandler(async (_req, res) => {
    const requests = await prisma.creditTransaction.findMany({ where: { status: 'pending' }, include: { user: userSelect }, orderBy: { id: 'asc' } });
    res.json({ requests });
  }),
);

staffCreditRouter.post(
  '/requests/:id/approve',
  asyncHandler(async (req, res) => {
    const row = await reviewCredit(idParam(req.params.id), req.user!.id, 'approve');
    res.json({ message: 'Request approved', transaction: { ...row, user: { id: row.user.id, username: row.user.username } } });
  }),
);

staffCreditRouter.post(
  '/requests/:id/reject',
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().max(500, 'Reason must be at most 500 characters').optional().default('') }).parse(req.body ?? {});
    const row = await reviewCredit(idParam(req.params.id), req.user!.id, 'reject', reason);
    res.json({ message: 'Request rejected', transaction: { ...row, user: { id: row.user.id, username: row.user.username } } });
  }),
);

// ---------------------------------------------------------------------------------------------
// stf-008: every customer's transactions. Posted money movements are never deleted or re-priced
// (balances follow from them); staff reverse them with an opposite adjustment instead.

export const TX_STATUSES = ['all', 'pending', 'posted', 'rejected', 'deleted'] as const;
/** Ledger types that move money in or out of the platform and so can be reversed. */
export const REVERSIBLE_TYPES = ['topup', 'withdraw', 'adjustment'];
const staffTxInclude = {
  user: userSelect,
  auction: { select: { id: true, name: true } },
  bidTicket: { select: { id: true, amount: true, status: true } },
  reviewedBy: userSelect,
} satisfies Prisma.CreditTransactionInclude;

const reversalPrefix = (id: bigint) => `Reversal of #${id}:`;

const staffFilter = z.object({
  customer: z.string().trim().max(100).optional().default(''),
  status: z.enum(TX_STATUSES).optional().default('all'),
});

staffCreditRouter.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const filter = transactionFilterSchema().parse(req.query);
    const { customer, status } = staffFilter.parse(req.query);
    const has = { contains: customer, mode: 'insensitive' as const };
    const extra: Prisma.CreditTransactionWhereInput[] = [status === 'all' ? { status: { not: 'deleted' } } : { status }];
    if (customer) extra.push({ user: { OR: [{ username: has }, { info: { fullName: has } }] } });
    res.json(await searchTransactions(filter, extra, staffTxInclude));
  }),
);

staffCreditRouter.get(
  '/transactions/:id',
  asyncHandler(async (req, res) => {
    const t = await prisma.creditTransaction.findUnique({ where: { id: idParam(req.params.id) }, include: staffTxInclude });
    if (!t) throw new HttpError(404, 'Transaction not found');
    const reversal = await prisma.creditTransaction.findFirst({ where: { transactionType: 'adjustment', description: { startsWith: reversalPrefix(t.id) } } });
    res.json({ transaction: { ...withDirection(t), reversedBy: reversal?.id ?? null } });
  }),
);

const adjustmentSchema = z.object({
  customer: z.string({ required_error: 'Choose a customer' }).trim().min(1, 'Choose a customer'),
  direction: z.enum(['credit', 'debit'], { errorMap: () => ({ message: 'Choose credit or debit' }) }),
  amount: moneyField,
  reason: z.string({ required_error: 'Give a reason' }).trim().min(3, 'Give a reason').max(500),
});

/** The customer's navbar and /credit refresh, as after an approved request. */
async function notifyBalance(userId: bigint, id: bigint, status = 'posted') {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  publishUserEvent(userId, { type: 'credit-request', id: `${status}-${id}`, data: { id, status, balance: u.creditBalance, held: u.heldBalance } });
}

// Manual adjustment: posted at once.
staffCreditRouter.post(
  '/transactions',
  asyncHandler(async (req, res) => {
    const d = adjustmentSchema.parse(req.body);
    const user = await prisma.user.findFirst({ where: { OR: [{ username: d.customer }, { email: d.customer }], role: 'customer', status: { not: 'deleted' } } });
    if (!user) throw new HttpError(400, 'Validation failed', { customer: 'No customer with that username or email' });
    const row = await prisma.$transaction((tx) =>
      applyCredit(tx, { userId: user.id, type: 'adjustment', direction: d.direction, amount: d.amount, description: `Adjustment: ${d.reason}`, reviewedById: req.user!.id }),
    );
    await notifyBalance(user.id, row.id);
    res.status(201).json({ message: 'Adjustment posted', transaction: withDirection(row) });
  }),
);

const editSchema = z
  .object({
    amount: moneyField,
    description: z.string().trim().min(1, 'Description cannot be empty').max(500),
  })
  .partial()
  .strict();

// Pending requests: amount and description. Other rows: description only.
staffCreditRouter.patch(
  '/transactions/:id',
  asyncHandler(async (req, res) => {
    const d = editSchema.parse(req.body);
    const id = idParam(req.params.id);
    const row = await prisma.$transaction(async (tx) => {
      const t = await lockTransaction(tx, id);
      if (t.status === 'deleted') throw new HttpError(404, 'Transaction not found');
      if (d.amount !== undefined && t.status !== 'pending') {
        throw new HttpError(400, 'Only the amount of a pending request can be changed; reverse posted transactions instead');
      }
      return tx.creditTransaction.update({ where: { id }, data: { amount: d.amount, description: d.description }, include: staffTxInclude });
    });
    await notifyBalance(row.userId, row.id, row.status);
    res.json({ message: 'Transaction updated', transaction: withDirection(row) });
  }),
);

// Soft delete of pending or rejected requests only.
staffCreditRouter.delete(
  '/transactions/:id',
  asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    const row = await prisma.$transaction(async (tx) => {
      const t = await lockTransaction(tx, id);
      if (t.status === 'deleted') throw new HttpError(404, 'Transaction not found');
      if (t.status === 'posted') throw new HttpError(400, 'Posted transactions cannot be deleted; reverse them instead');
      return tx.creditTransaction.update({ where: { id }, data: { status: 'deleted' } });
    });
    await notifyBalance(row.userId, row.id, 'deleted');
    res.json({ message: 'Transaction deleted' });
  }),
);

// Reverse a posted top-up, withdrawal or adjustment with an opposite adjustment (once).
staffCreditRouter.post(
  '/transactions/:id/reverse',
  asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    const row = await prisma.$transaction(async (tx) => {
      const t = await lockTransaction(tx, id);
      if (t.status !== 'posted' || !REVERSIBLE_TYPES.includes(t.transactionType)) {
        throw new HttpError(400, 'Only posted top-ups, withdrawals and adjustments can be reversed');
      }
      if (t.description?.startsWith('Reversal of #')) throw new HttpError(400, 'A reversal cannot be reversed');
      if (await tx.creditTransaction.findFirst({ where: { transactionType: 'adjustment', description: { startsWith: reversalPrefix(t.id) } } })) {
        throw new HttpError(400, 'This transaction has already been reversed');
      }
      const addedCredit = t.transactionType === 'topup' || directionOf(t) === 'credit';
      return applyCredit(tx, {
        userId: t.userId,
        type: 'adjustment',
        direction: addedCredit ? 'debit' : 'credit',
        amount: t.amount,
        description: `${reversalPrefix(t.id)} ${t.description ?? t.transactionType}`,
        reviewedById: req.user!.id,
      });
    });
    await notifyBalance(row.userId, row.id);
    res.status(201).json({ message: 'Transaction reversed', transaction: withDirection(row) });
  }),
);
