import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/http';
import { getOutbox } from '../lib/mailer';
import { parseId } from './auctions';

// Development/test helpers. Not mounted when NODE_ENV=production.
export const devRouter = Router();

devRouter.get('/outbox', (req, res) => {
  const to = typeof req.query.to === 'string' ? req.query.to.toLowerCase() : undefined;
  res.json({ mails: getOutbox(to) });
});

/** Moves an auction's end time to now so "ended" behaviour can be exercised without waiting. */
devRouter.post(
  '/auctions/:id/expire',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const now = new Date(Date.now() - 1000);
    const a = await prisma.auction.findUniqueOrThrow({ where: { id } });
    await prisma.auction.update({
      where: { id },
      data: { endTime: now, startTime: a.startTime > now ? new Date(now.getTime() - 60_000) : a.startTime },
    });
    res.json({ ok: true });
  }),
);

/** sell-007: moves an auction's start to `seconds` from now (end follows the duration), so the start can be watched live. */
devRouter.post(
  '/auctions/:id/start-in',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const seconds = Number(req.body?.seconds ?? 0);
    const a = await prisma.auction.findUniqueOrThrow({ where: { id } });
    const startTime = new Date(Date.now() + seconds * 1000);
    await prisma.auction.update({ where: { id }, data: { startTime, endTime: new Date(startTime.getTime() + a.durationMinutes * 60_000) } });
    res.json({ ok: true, startTime });
  }),
);

/** Stored (not derived) auction status, so scheduled jobs can be observed. */
devRouter.get(
  '/auctions/:id/raw',
  asyncHandler(async (req, res) => {
    const a = await prisma.auction.findUniqueOrThrow({ where: { id: parseId(req.params.id) } });
    res.json({ status: a.status, startTime: a.startTime, endTime: a.endTime, durationMinutes: a.durationMinutes, closedAt: a.closedAt, winnerId: a.winnerId });
  }),
);
