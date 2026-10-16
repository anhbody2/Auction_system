import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { applyCredit } from '../lib/credit';
import { asyncHandler } from '../lib/http';
import { moneyField } from '../lib/validation';
import { requireAuth } from '../middleware/auth';

export const creditRouter = Router();
creditRouter.use(requireAuth);

async function summary(userId: bigint) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const transactions = await prisma.creditTransaction.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    take: 100,
    include: { auction: { select: { id: true, name: true } } },
  });
  return {
    balance: user.creditBalance,
    held: user.heldBalance,
    available: user.creditBalance.minus(user.heldBalance),
    transactions,
  };
}

creditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await summary(req.user!.id));
  }),
);

const amountSchema = z.object({ amount: moneyField });

creditRouter.post(
  '/topup',
  asyncHandler(async (req, res) => {
    const { amount } = amountSchema.parse(req.body);
    await prisma.$transaction((tx) => applyCredit(tx, { userId: req.user!.id, type: 'topup', amount, description: 'Top up' }));
    res.status(201).json({ message: 'Credit topped up', ...(await summary(req.user!.id)) });
  }),
);

creditRouter.post(
  '/withdraw',
  asyncHandler(async (req, res) => {
    const { amount } = amountSchema.parse(req.body);
    await prisma.$transaction((tx) => applyCredit(tx, { userId: req.user!.id, type: 'withdraw', amount, description: 'Withdrawal' }));
    res.status(201).json({ message: 'Withdrawal completed', ...(await summary(req.user!.id)) });
  }),
);
