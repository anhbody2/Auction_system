import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { reviewCredit } from '../lib/creditRequests';
import { HttpError, asyncHandler } from '../lib/http';
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
