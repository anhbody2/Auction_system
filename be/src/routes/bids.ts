import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { auctionInclude, auctionView, effectiveStatus, nextMinBid } from '../lib/auctions';
import { applyCredit } from '../lib/credit';
import { publishAuctionEvent, streamAuction } from '../lib/events';
import { HttpError, asyncHandler } from '../lib/http';
import { moneyField } from '../lib/validation';
import { requireAuth } from '../middleware/auth';
import { parseId } from './auctions';

export const bidsRouter = Router();

const fmt = (d: Prisma.Decimal) => `$${d.toFixed(2)}`;

/** Locks the auction row so bids on the same auction are applied one at a time. */
async function lockAuction(tx: Prisma.TransactionClient, id: bigint) {
  await tx.$queryRaw`SELECT id FROM auctions WHERE id = ${id} FOR UPDATE`;
  return tx.auction.findUnique({ where: { id } });
}

/** rt-001: the 'bid' event sent on GET /auctions/:id/events and returned by POST /auctions/:id/bids. */
export interface BidEvent {
  auctionId: bigint;
  bid: { id: bigint; amount: Prisma.Decimal; status: 'active'; createdAt: Date; bidder: { id: bigint; username: string } };
  /** Tickets this bid moved from 'active' to 'outbid' (the previous leader, or the bidder's own old bid). */
  outbidBidIds: bigint[];
  currentPrice: Prisma.Decimal;
  nextMinBid: Prisma.Decimal;
  bidCount: number;
  reserveMet: boolean;
}

/** rt-001: live bid events for one auction (Server-Sent Events). Public, like the bid history. */
bidsRouter.get(
  '/auctions/:id/events',
  asyncHandler(async (req, res) => {
    const auctionId = parseId(req.params.id);
    const exists = await prisma.auction.findUnique({ where: { id: auctionId }, select: { id: true } });
    if (!exists) throw new HttpError(404, 'Auction not found');
    streamAuction(req, res, auctionId);
  }),
);

bidsRouter.post(
  '/auctions/:id/bids',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auctionId = parseId(req.params.id);
    const { amount: raw } = z.object({ amount: moneyField }).parse(req.body);
    const amount = new Prisma.Decimal(raw);
    const bidderId = req.user!.id;

    const { ticket, event } = await prisma.$transaction(async (tx) => {
      const auction = await lockAuction(tx, auctionId);
      if (!auction) throw new HttpError(404, 'Auction not found');
      if (auction.sellerId === bidderId) throw new HttpError(403, 'You cannot bid on your own auction');

      const status = effectiveStatus(auction);
      if (status === 'cancelled') throw new HttpError(400, 'This auction has been cancelled');
      if (status === 'ended') throw new HttpError(400, 'This auction has ended');
      if (status === 'upcoming') throw new HttpError(400, 'This auction has not started yet');

      const minimum = await nextMinBid(auction);
      if (amount.lessThan(minimum)) {
        throw new HttpError(400, `Bid must be at least ${fmt(minimum)}`, { amount: `Bid must be at least ${fmt(minimum)}` });
      }

      const leading = await tx.bidTicket.findFirst({ where: { auctionId, status: 'active' }, orderBy: { amount: 'desc' } });

      // A leader raising their own bid: free the old hold before holding the new amount.
      if (leading && leading.bidderId === bidderId) {
        await tx.bidTicket.update({ where: { id: leading.id }, data: { status: 'outbid' } });
        await applyCredit(tx, { userId: bidderId, type: 'release', amount: leading.amount, auctionId, bidTicketId: leading.id, description: 'Released: raised own bid' });
      }

      const created = await tx.bidTicket.create({ data: { auctionId, bidderId, amount, status: 'active' } });
      await applyCredit(tx, { userId: bidderId, type: 'hold', amount, auctionId, bidTicketId: created.id, description: `Bid on ${auction.name}` });

      if (leading && leading.bidderId !== bidderId) {
        await tx.bidTicket.update({ where: { id: leading.id }, data: { status: 'outbid' } });
        await applyCredit(tx, { userId: leading.bidderId, type: 'release', amount: leading.amount, auctionId, bidTicketId: leading.id, description: `Outbid on ${auction.name}` });
      }

      await tx.auction.update({ where: { id: auctionId }, data: { currentPrice: amount, status: 'active' } });

      // rt-001: what every open page needs to update itself; published only once the transaction commits.
      const event: BidEvent = {
        auctionId,
        bid: { id: created.id, amount, status: 'active', createdAt: created.createdAt, bidder: { id: bidderId, username: req.user!.username } },
        outbidBidIds: leading ? [leading.id] : [],
        currentPrice: amount,
        nextMinBid: await nextMinBid({ initialPrice: auction.initialPrice, currentPrice: amount }),
        bidCount: await tx.bidTicket.count({ where: { auctionId } }),
        reserveMet: !auction.reservePrice || amount.greaterThanOrEqualTo(auction.reservePrice),
      };
      return { ticket: created, event };
    });

    publishAuctionEvent(auctionId, { type: 'bid', id: String(event.bid.id), data: event });
    res.status(201).json({ message: 'Bid placed', bid: ticket, event });
  }),
);

bidsRouter.post(
  '/auctions/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auctionId = parseId(req.params.id);
    await prisma.$transaction(async (tx) => {
      const auction = await lockAuction(tx, auctionId);
      if (!auction) throw new HttpError(404, 'Auction not found');
      // sell-005: the seller may cancel only before the start time; after that only an admin can.
      const isAdmin = req.user!.role === 'admin';
      if (!isAdmin && auction.sellerId !== req.user!.id) throw new HttpError(403, 'Only the seller can cancel this auction');
      const status = effectiveStatus(auction);
      if (status === 'cancelled') throw new HttpError(400, 'This auction is already cancelled');
      if (status === 'ended') throw new HttpError(400, 'An auction that has ended cannot be cancelled');
      // Checked on start_time, not only the stored status, so it holds before the start job has run.
      if (!isAdmin && auction.startTime.getTime() <= Date.now()) {
        throw new HttpError(403, 'This auction has started; only an admin can cancel it');
      }

      const held = await tx.bidTicket.findMany({ where: { auctionId, status: 'active' } });
      for (const t of held) {
        await applyCredit(tx, { userId: t.bidderId, type: 'release', amount: t.amount, auctionId, bidTicketId: t.id, description: `Auction cancelled: ${auction.name}` });
      }
      await tx.bidTicket.updateMany({ where: { auctionId }, data: { status: 'cancelled' } });
      await tx.auction.update({ where: { id: auctionId }, data: { status: 'cancelled', cancelledAt: new Date() } });
    });
    res.json({ message: 'Auction cancelled' });
  }),
);

/** Every auction I've bid on, with my latest bid and where I stand. */
bidsRouter.get(
  '/me/bids',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const tickets = await prisma.bidTicket.findMany({ where: { bidderId: me }, orderBy: { id: 'desc' } });
    const latest = new Map<bigint, (typeof tickets)[number]>();
    for (const t of tickets) if (!latest.has(t.auctionId)) latest.set(t.auctionId, t);

    const auctions = await prisma.auction.findMany({ where: { id: { in: [...latest.keys()] } }, include: auctionInclude });
    const leaders = await prisma.bidTicket.findMany({ where: { auctionId: { in: [...latest.keys()] }, status: 'active' } });
    const leaderOf = new Map(leaders.map((l) => [l.auctionId, l.bidderId]));

    const items = await Promise.all(
      auctions.map(async (a) => {
        const view = await auctionView(a, me);
        const mine = latest.get(a.id)!;
        let myStatus: 'winning' | 'outbid' | 'won' | 'lost' | 'cancelled';
        if (view.status === 'cancelled') myStatus = 'cancelled';
        else if (view.status === 'ended') myStatus = a.winnerId === me ? 'won' : 'lost';
        else myStatus = leaderOf.get(a.id) === me ? 'winning' : 'outbid';
        return { auction: view, myLatestBid: mine.amount, myLatestBidAt: mine.createdAt, myStatus };
      }),
    );
    items.sort((x, y) => y.myLatestBidAt.getTime() - x.myLatestBidAt.getTime());
    res.json({ items });
  }),
);

bidsRouter.get(
  '/auctions/:id/bids',
  asyncHandler(async (req, res) => {
    const auctionId = parseId(req.params.id);
    const bids = await prisma.bidTicket.findMany({
      where: { auctionId },
      orderBy: [{ amount: 'desc' }, { id: 'desc' }],
      include: { bidder: { select: { id: true, username: true } } },
      take: 200,
    });
    res.json({
      bids: bids.map((b) => ({ id: b.id, amount: b.amount, status: b.status, createdAt: b.createdAt, bidder: b.bidder })),
    });
  }),
);
