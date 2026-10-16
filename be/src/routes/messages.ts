import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { HttpError, asyncHandler } from '../lib/http';
import { requireAuth } from '../middleware/auth';
import { parseId } from './auctions';

// Public Q&A thread on each auction: anyone can read, signed-in customers can post.
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
    const { content } = z
      .object({ content: z.string({ required_error: 'Message cannot be empty' }).trim().min(1, 'Message cannot be empty').max(1000, 'Message is too long (max 1000 characters)') })
      .parse(req.body);
    if (!(await prisma.auction.findUnique({ where: { id: auctionId }, select: { id: true } }))) {
      throw new HttpError(404, 'Auction not found');
    }
    const message = await prisma.auctionMessage.create({ data: { auctionId, authorId: req.user!.id, content }, include });
    res.status(201).json({ message });
  }),
);
