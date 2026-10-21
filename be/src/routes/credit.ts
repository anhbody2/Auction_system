import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requestCredit } from '../lib/creditRequests';
import { asyncHandler } from '../lib/http';
import { searchTransactions, transactionFilterSchema } from '../lib/transactions';
import { moneyField } from '../lib/validation';
import { requireAuth } from '../middleware/auth';

export const creditRouter = Router();
creditRouter.use(requireAuth);

async function summary(userId: bigint) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const [transactions, pending] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { userId, status: { not: 'deleted' } },
      orderBy: { id: 'desc' },
      take: 100,
      include: { auction: { select: { id: true, name: true } } },
    }),
    // stf-007: requests waiting for staff
    prisma.creditTransaction.findMany({ where: { userId, status: 'pending' }, orderBy: { id: 'desc' } }),
  ]);
  return {
    balance: user.creditBalance,
    held: user.heldBalance,
    available: user.creditBalance.minus(user.heldBalance),
    transactions,
    pending,
  };
}

creditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await summary(req.user!.id));
  }),
);

// trx-001: search the signed-in user's transactions (date range within 30 days, name, id, amount range; all combined).
creditRouter.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const filter = transactionFilterSchema().parse(req.query);
    res.json(await searchTransactions(filter, [{ userId: req.user!.id, status: { not: 'deleted' } }]));
  }),
);

const amountSchema = z.object({ amount: moneyField });

// stf-007: both create a pending request; the balance changes when staff approve it.
creditRouter.post(
  '/topup',
  asyncHandler(async (req, res) => {
    const { amount } = amountSchema.parse(req.body);
    const request = await requestCredit(req.user!.id, 'topup', amount);
    res.status(201).json({ message: 'Top-up requested. It will be added once staff approve it.', request, ...(await summary(req.user!.id)) });
  }),
);

creditRouter.post(
  '/withdraw',
  asyncHandler(async (req, res) => {
    const { amount } = amountSchema.parse(req.body);
    const request = await requestCredit(req.user!.id, 'withdraw', amount);
    res.status(201).json({ message: 'Withdrawal requested. It will be paid out once staff approve it.', request, ...(await summary(req.user!.id)) });
  }),
);
