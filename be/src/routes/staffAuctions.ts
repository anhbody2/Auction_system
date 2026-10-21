import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { lockAuction, publishVoided, voidAuction } from '../lib/auctionVoid';
import { auctionInclude, auctionView, effectiveStatus } from '../lib/auctions';
import { durationField } from '../lib/duration';
import { goodsInclude, goodsState, lockOwnGoods } from '../lib/goods';
import { HttpError, asyncHandler } from '../lib/http';
import { settleAuction } from '../lib/settlement';
import { dateField, rangeBounds } from '../lib/statistics';
import { requirePermission } from '../middleware/auth';
import { optionalPrice, parseCreate, parseId, price } from './auctions';

/**
 * stf-006 Staff - Auction Management. Mounted at /api/staff/manage/auctions (/api/staff/auctions is the
 * stf-001 statistics list). Every route needs auction.manage.
 */
export const staffAuctionsRouter = Router();
staffAuctionsRouter.use(requirePermission('auction.manage'));

export const STAFF_AUCTION_STATUSES = ['all', 'upcoming', 'active', 'ended', 'cancelled', 'deleted'] as const;
export const STARTED_EDIT_MESSAGE = 'Only the description can be changed once the auction has started';
const DELETE_REASON = 'Auction deleted by staff';

const staffInclude = {
  ...auctionInclude,
  seller: { select: { id: true, username: true, email: true } },
  settlement: true,
} satisfies Prisma.AuctionInclude;
type StaffAuctionRow = Prisma.AuctionGetPayload<{ include: typeof staffInclude }>;

async function staffAuctionView(a: StaffAuctionRow) {
  const view = await auctionView(a, undefined);
  return {
    ...view,
    seller: { id: a.seller.id, username: a.seller.username },
    reservePrice: a.reservePrice,
    deletedAt: a.deletedAt,
    settlement: a.settlement
      ? { status: a.settlement.settlementStatus, commission: a.settlement.commissionAmount, settledAt: a.settlement.settledAt }
      : null,
  };
}

/** WHERE for a derived status (stored status alone lags behind the start/close jobs). */
function statusWhere(status: (typeof STAFF_AUCTION_STATUSES)[number], now: Date): Prisma.AuctionWhereInput {
  const open = { status: { notIn: ['cancelled', 'ended'] } };
  switch (status) {
    case 'deleted':
      return { deletedAt: { not: null } };
    case 'upcoming':
      return { deletedAt: null, ...open, startTime: { gt: now } };
    case 'active':
      return { deletedAt: null, ...open, startTime: { lte: now }, endTime: { gt: now } };
    case 'ended':
      return { deletedAt: null, OR: [{ status: 'ended' }, { status: { not: 'cancelled' }, endTime: { lte: now } }] };
    case 'cancelled':
      return { deletedAt: null, status: 'cancelled' };
    default:
      return { deletedAt: null };
  }
}

const listSchema = z
  .object({
    q: z.string().trim().max(100).optional().default(''),
    seller: z.string().trim().max(100).optional().default(''),
    status: z.enum(STAFF_AUCTION_STATUSES).optional().default('all'),
    from: z.union([z.literal(''), dateField('From')]).optional(),
    to: z.union([z.literal(''), dateField('To')]).optional(),
    tz: z.coerce.number().int().min(-840).max(840).default(0),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, { path: ['from'], message: 'From date must be on or before To date' });

// List: auction name, seller, status and start-date range, all combined.
staffAuctionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const f = listSchema.parse(req.query);
    const has = (s: string) => ({ contains: s, mode: 'insensitive' as const });
    const and: Prisma.AuctionWhereInput[] = [statusWhere(f.status, new Date())];
    if (f.q) and.push({ name: has(f.q) });
    if (f.seller) and.push({ seller: { OR: [{ username: has(f.seller) }, { info: { fullName: has(f.seller) } }] } });
    if (f.from || f.to) {
      const bounds = rangeBounds({ from: f.from || '1970-01-01', to: f.to || '9999-12-31', tz: f.tz });
      and.push({ startTime: { gte: f.from ? bounds.gte : undefined, lt: f.to ? bounds.lt : undefined } });
    }
    const where = { AND: and };
    const [total, rows] = await Promise.all([
      prisma.auction.count({ where }),
      prisma.auction.findMany({ where, include: staffInclude, orderBy: { id: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    ]);
    res.json({ auctions: await Promise.all(rows.map(staffAuctionView)), total, page: f.page, pageSize: f.pageSize });
  }),
);

// The seller's goods that can go into a new auction (approved, owned, not in an open auction).
staffAuctionsRouter.get(
  '/seller-goods',
  asyncHandler(async (req, res) => {
    const { seller } = z.object({ seller: z.string().trim().min(1, 'Choose a seller') }).parse(req.query);
    const user = await prisma.user.findFirst({ where: { OR: [{ username: seller }, { email: seller }], role: 'customer', status: { not: 'deleted' } } });
    if (!user) throw new HttpError(400, 'Validation failed', { seller: 'No customer with that username or email' });
    const goods = await prisma.goods.findMany({
      where: { OR: [{ sellerId: user.id }, { buyerId: user.id }], status: 'active' },
      include: goodsInclude,
      orderBy: { id: 'desc' },
    });
    res.json({
      seller: { id: user.id, username: user.username },
      goods: goods.filter((g) => goodsState(g, user.id) === 'available').map((g) => ({ id: g.id, name: g.name, description: g.description, images: g.images.map((i) => i.imageUrl) })),
    });
  }),
);

staffAuctionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const auction = await prisma.auction.findUnique({ where: { id: parseId(req.params.id) }, include: staffInclude });
    if (!auction) throw new HttpError(404, 'Auction not found');
    const bids = await prisma.bidTicket.findMany({
      where: { auctionId: auction.id },
      orderBy: [{ amount: 'desc' }, { id: 'desc' }],
      include: { bidder: { select: { id: true, username: true } } },
    });
    res.json({
      auction: await staffAuctionView(auction),
      bids: bids.map((b) => ({ id: b.id, amount: b.amount, status: b.status, createdAt: b.createdAt, bidder: b.bidder })),
    });
  }),
);

// Add an auction for a chosen seller from their approved, available goods. Stored 'upcoming' (sell-007 'New').
staffAuctionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { seller } = z.object({ seller: z.string({ required_error: 'Choose a seller' }).trim().min(1, 'Choose a seller') }).parse(req.body ?? {});
    const d = parseCreate(req.body);
    const user = await prisma.user.findFirst({ where: { OR: [{ username: seller }, { email: seller }], role: 'customer', status: { not: 'deleted' } } });
    if (!user) throw new HttpError(400, 'Validation failed', { seller: 'No customer with that username or email' });
    const now = new Date();
    const startTime = d.startTime < now ? now : d.startTime;
    const auction = await prisma.$transaction(async (tx) => {
      const locked = await lockOwnGoods(tx, BigInt(d.goodsId), user.id).catch(() => null);
      const reason = !locked
        ? 'These goods do not belong to this seller'
        : locked.state === 'pending' || locked.state === 'rejected'
          ? 'Goods must be approved before auction'
          : locked.state === 'in_auction'
            ? 'These goods are already in an auction'
            : locked.state === 'sold'
              ? 'These goods have been sold'
              : null;
      if (reason || !locked) throw new HttpError(400, reason ?? 'Goods not found', { goodsId: reason ?? 'Goods not found' });
      return tx.auction.create({
        data: {
          sellerId: user.id,
          goodsId: locked.goods.id,
          name: d.name,
          description: d.description,
          initialPrice: d.initialPrice,
          reservePrice: d.reservePrice ?? null,
          startTime,
          endTime: new Date(startTime.getTime() + d.duration * 60_000),
          durationMinutes: d.duration,
          status: 'upcoming',
        },
        include: staffInclude,
      });
    });
    res.status(201).json({ message: 'Auction created', auction: await staffAuctionView(auction) });
  }),
);

const editSchema = z
  .object({
    name: z.string().trim().min(3, 'Auction name must be at least 3 characters').max(255),
    description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
    initialPrice: price('Starting price'),
    reservePrice: z.union([z.null(), optionalPrice('Reserve price')]),
    startTime: z.coerce.date({ errorMap: () => ({ message: 'Start time is required' }) }),
    duration: durationField,
  })
  .partial()
  .strict();

// Upcoming auctions: everything; started ones: description only. end_time follows start + duration.
staffAuctionsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const d = editSchema.parse(req.body);
    const id = parseId(req.params.id);
    const auction = await prisma.$transaction(async (tx) => {
      const current = await lockAuction(tx, id);
      if (!current || current.deletedAt) throw new HttpError(404, 'Auction not found');
      const status = effectiveStatus(current);
      if (status === 'cancelled') throw new HttpError(400, 'A cancelled auction cannot be changed');
      const changesTerms = Object.keys(d).some((k) => k !== 'description');
      if (status !== 'upcoming' && changesTerms) throw new HttpError(400, STARTED_EDIT_MESSAGE);

      const startTime = d.startTime ?? current.startTime;
      const duration = d.duration ?? current.durationMinutes;
      const initialPrice = d.initialPrice ?? current.initialPrice.toNumber();
      const reservePrice = d.reservePrice === undefined ? current.reservePrice?.toNumber() ?? null : d.reservePrice ?? null;
      const fields: Record<string, string> = {};
      if (d.startTime && d.startTime.getTime() < Date.now() - 5 * 60 * 1000) fields.startTime = 'Start time cannot be in the past';
      if (reservePrice !== null && reservePrice < initialPrice) fields.reservePrice = 'Reserve price cannot be below the starting price';
      if (Object.keys(fields).length) throw new HttpError(400, 'Validation failed', fields);

      return tx.auction.update({
        where: { id },
        data: {
          name: d.name,
          description: d.description,
          ...(changesTerms
            ? {
                initialPrice,
                reservePrice,
                startTime,
                durationMinutes: duration,
                endTime: new Date(startTime.getTime() + duration * 60_000),
              }
            : {}),
        },
        include: staffInclude,
      });
    });
    res.json({ message: 'Auction updated', auction: await staffAuctionView(auction) });
  }),
);

// Soft delete. Upcoming/active: bids voided and holds released like a cancel. Ended: hidden only (settled first
// if the close job has not run yet, so no money moves after this).
staffAuctionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const before = await prisma.auction.findUnique({ where: { id } });
    if (!before || before.deletedAt) throw new HttpError(404, 'Auction not found');
    if (effectiveStatus(before) === 'ended' && before.status !== 'ended') await settleAuction(id);

    const voided = await prisma.$transaction(async (tx) => {
      const current = await lockAuction(tx, id);
      if (!current || current.deletedAt) throw new HttpError(404, 'Auction not found');
      const status = effectiveStatus(current);
      if (status === 'upcoming' || status === 'active') return voidAuction(tx, current, DELETE_REASON, { deletedAt: new Date() });
      await tx.auction.update({ where: { id }, data: { deletedAt: new Date() } });
      return null;
    });
    if (voided) publishVoided(voided);
    res.json({ message: 'Auction deleted' });
  }),
);
