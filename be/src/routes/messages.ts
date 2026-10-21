import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { effectiveStatus } from '../lib/auctions';
import { HttpError, asyncHandler } from '../lib/http';
import { requireAuth } from '../middleware/auth';
import { parseId } from './auctions';

// Public Q&A thread on each auction: anyone can read; signed-in users can post until the auction closes
// (cmt-001). Comments are kept and stay readable after the close.
export const messagesRouter = Router();

const include = { author: { select: { id: true, username: true } } };

messagesRouter.get(
  '/auctions/:id/messages',
  asyncHandler(async (req, res) => {
    const auctionId = parseId(req.params.id);
    const messages = await prisma.auctionMessage.findMany({ where: { auctionId }, orderBy: { id: 'asc' }, include, take: 500 });
    res.json({ messages });
  }),
);

messagesRouter.post(
  '/auctions/:id/messages',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auctionId = parseId(req.params.id);
    const auction = await prisma.auction.findUnique({ where: { id: auctionId }, select: { status: true, startTime: true, endTime: true } });
    if (!auction) throw new HttpError(404, 'Auction not found');
    // Computed status, so the rule holds from the end time even before the close job has run.
    const status = effectiveStatus(auction);
    if (status === 'ended' || status === 'cancelled') throw new HttpError(400, 'Comments are closed for this auction');
    const { content } = z
      .object({ content: z.string({ required_error: 'Message cannot be empty' }).trim().min(1, 'Message cannot be empty').max(1000, 'Message is too long (max 1000 characters)') })
      .parse(req.body);
    const message = await prisma.auctionMessage.create({ data: { auctionId, authorId: req.user!.id, content }, include });
    res.status(201).json({ message });
  }),
);
