import type { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { auctionInclude, auctionView } from '../lib/auctions';
import { HttpError, asyncHandler } from '../lib/http';
import { isStoredUpload } from '../lib/images';
import { optionalAuth, requireAuth } from '../middleware/auth';

export const auctionsRouter = Router();

export const CONDITIONS = ['new', 'like_new', 'used', 'for_parts'] as const;
/** Ended auctions stay on the homepage ("just completed") for this many days. */
const JUST_COMPLETED_DAYS = 7;

const price = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .positive(`${label} must be greater than 0`)
    .max(1_000_000_000, `${label} is too large`)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, `${label} can have at most 2 decimals`);

const optionalPrice = (label: string) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), price(label).optional());

const dateField = (label: string) =>
  z.coerce.date({ errorMap: () => ({ message: `${label} is required` }) });

const itemSchema = z.object({
  name: z.string().trim().min(3, 'Item name must be at least 3 characters').max(255),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  categoryId: z.coerce.number({ invalid_type_error: 'Choose a category' }).int().positive('Choose a category'),
  condition: z.enum(CONDITIONS, { errorMap: () => ({ message: 'Choose a condition' }) }),
  // upl-001: images are uploaded (POST /api/uploads); only this server's upload URLs are accepted.
  imageUrl: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().optional()),
});

// Prices and times are validated separately so cross-field errors show even when item fields are invalid.
const termsSchema = z
  .object({
    initialPrice: price('Starting price'),
    reservePrice: optionalPrice('Reserve price'),
    startTime: dateField('Start time'),
    endTime: dateField('End time'),
  })
  .superRefine((d, ctx) => {
    if (d.startTime.getTime() < Date.now() - 5 * 60 * 1000) {
      ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'Start time cannot be in the past' });
    }
    if (d.endTime <= d.startTime) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be after start time' });
    } else if (d.endTime.getTime() - d.startTime.getTime() < 60 * 1000) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Auction must last at least 1 minute' });
    } else if (d.endTime.getTime() - d.startTime.getTime() > 30 * 24 * 3600 * 1000) {
      ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'Auction can last at most 30 days' });
    }
    if (d.reservePrice !== undefined && d.reservePrice < d.initialPrice) {
      ctx.addIssue({ code: 'custom', path: ['reservePrice'], message: 'Reserve price cannot be below the starting price' });
    }
  });

const timeOrderSchema = z
  .object({ startTime: z.coerce.date(), endTime: z.coerce.date() })
  .refine((d) => d.endTime > d.startTime, { path: ['endTime'], message: 'End time must be after start time' });

function parseCreate(body: unknown) {
  const item = itemSchema.safeParse(body);
  const terms = termsSchema.safeParse(body);
  if (item.success && terms.success) return { ...item.data, ...terms.data };
  const issues = [...(item.success ? [] : item.error.issues), ...(terms.success ? [] : terms.error.issues)];
  if (!terms.success) {
    // Terms failed before its cross-field refinement ran; still report the time order when both dates parse.
    const order = timeOrderSchema.safeParse(body);
    if (!order.success && !issues.some((i) => i.path[0] === 'endTime')) issues.push(...order.error.issues);
  }
  throw new z.ZodError(issues);
}

auctionsRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    res.json({ categories: await prisma.category.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' } }) });
  }),
);

auctionsRouter.post(
  '/auctions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const d = parseCreate(req.body);
    const category = await prisma.category.findUnique({ where: { id: BigInt(d.categoryId) } });
    if (!category) throw new HttpError(400, 'Validation failed', { categoryId: 'Choose a category' });
    if (d.imageUrl && !(await isStoredUpload(d.imageUrl))) throw new HttpError(400, 'Validation failed', { imageUrl: 'Upload the image instead of linking to it' });

    const sellerId = req.user!.id;
    const now = new Date();
    const startTime = d.startTime < now ? now : d.startTime;
    const auction = await prisma.$transaction(async (tx) => {
      const goods = await tx.goods.create({
        data: {
          sellerId,
          categoryId: category.id,
          name: d.name,
          description: d.description,
          condition: d.condition,
          images: d.imageUrl ? { create: { imageUrl: d.imageUrl } } : undefined,
        },
      });
      return tx.auction.create({
        data: {
          sellerId,
          goodsId: goods.id,
          name: d.name,
          description: d.description,
          initialPrice: d.initialPrice,
          reservePrice: d.reservePrice ?? null,
          startTime,
          endTime: d.endTime,
          durationMinutes: Math.round((d.endTime.getTime() - startTime.getTime()) / 60000),
          status: startTime <= now ? 'active' : 'upcoming',
        },
        include: auctionInclude,
      });
    });
    res.status(201).json({ message: 'Auction created', auction: await auctionView(auction, sellerId) });
  }),
);

auctionsRouter.get(
  '/auctions/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const auction = await prisma.auction.findUnique({ where: { id }, include: auctionInclude });
    if (!auction) throw new HttpError(404, 'Auction not found');
    res.json({ auction: await auctionView(auction, req.user?.id) });
  }),
);

export const SEARCH_FIELDS = ['all', 'seller', 'auction', 'category', 'product'] as const;
const searchSchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  field: z.enum(SEARCH_FIELDS).optional().default('all'),
});

/** Case-insensitive keyword match on seller name, auction, category or product (goods). */
function searchWhere(q: string, field: (typeof SEARCH_FIELDS)[number]): Prisma.AuctionWhereInput {
  const has = { contains: q, mode: 'insensitive' as const };
  const by: Record<Exclude<typeof field, 'all'>, Prisma.AuctionWhereInput[]> = {
    seller: [{ seller: { username: has } }, { seller: { info: { fullName: has } } }],
    auction: [{ name: has }, { description: has }],
    category: [{ goods: { category: { name: has } } }],
    product: [{ goods: { name: has } }, { goods: { description: has } }],
  };
  return { OR: field === 'all' ? Object.values(by).flat() : by[field] };
}

auctionsRouter.get(
  '/auctions',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { q, field } = searchSchema.parse(req.query);
    const match = q ? searchWhere(q, field) : {};
    const now = new Date();
    const recent = new Date(now.getTime() - JUST_COMPLETED_DAYS * 24 * 3600 * 1000);
    const [open, completed] = await Promise.all([
      // live + upcoming, soonest ending first
      prisma.auction.findMany({
        where: { AND: [{ status: { in: ['active', 'upcoming'] }, endTime: { gt: now } }, match] },
        include: auctionInclude,
        orderBy: { endTime: 'asc' },
        take: 200,
      }),
      // just completed, most recent first. Past end time counts even before the close job has run.
      prisma.auction.findMany({
        where: { AND: [{ status: { not: 'cancelled' }, endTime: { gte: recent, lte: now } }, match] },
        include: auctionInclude,
        orderBy: { endTime: 'desc' },
        take: 100,
      }),
    ]);
    const views = await Promise.all([...open, ...completed].map((a) => auctionView(a, req.user?.id)));
    res.json({ auctions: views, justCompletedDays: JUST_COMPLETED_DAYS });
  }),
);

auctionsRouter.get(
  '/me/auctions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auctions = await prisma.auction.findMany({
      where: { sellerId: req.user!.id },
      include: auctionInclude,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ auctions: await Promise.all(auctions.map((a) => auctionView(a, req.user!.id))) });
  }),
);

export function parseId(raw: string) {
  if (!/^\d{1,18}$/.test(raw)) throw new HttpError(404, 'Not found');
  return BigInt(raw);
}
