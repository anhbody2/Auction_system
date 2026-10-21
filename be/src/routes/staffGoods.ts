import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { effectiveStatus } from '../lib/auctions';
import { GOODS_STATUSES, IN_AUCTION_MESSAGE, checkGoodsRefs, goodsSchema } from '../lib/goods';
import { HttpError, asyncHandler } from '../lib/http';
import { sendMail } from '../lib/mailer';
import { requirePermission } from '../middleware/auth';

/** stf-005 Staff - Goods Management. Mounted at /api/staff/goods; every route needs goods.manage. */
export const staffGoodsRouter = Router();
staffGoodsRouter.use(requirePermission('goods.manage'));

export const STAFF_GOODS_PAGE_SIZE = 20;
export const DELETE_OPEN_MESSAGE = 'Goods in an upcoming or active auction cannot be deleted';

const staffGoodsInclude = {
  category: true,
  images: { orderBy: { sortOrder: 'asc' } },
  seller: { select: { id: true, username: true, email: true } },
  buyer: { select: { id: true, username: true } },
  reviewedBy: { select: { id: true, username: true } },
  auctions: { select: { id: true, name: true, status: true, startTime: true, endTime: true }, orderBy: { id: 'desc' } },
} satisfies Prisma.GoodsInclude;
type StaffGoodsRow = Prisma.GoodsGetPayload<{ include: typeof staffGoodsInclude }>;

/** Stored status upcoming/active means the goods are in an open auction (an ended one is closed by the job). */
const openAuction = (g: { auctions: { status: string }[] }) => g.auctions.find((a) => a.status === 'upcoming' || a.status === 'active');

function staffGoodsView(g: StaffGoodsRow) {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    condition: g.condition,
    category: g.category ? { id: g.category.id, name: g.category.name } : null,
    images: g.images.map((i) => i.imageUrl),
    status: g.status,
    rejectionReason: g.rejectionReason,
    seller: { id: g.seller.id, username: g.seller.username },
    buyer: g.buyer,
    reviewedBy: g.reviewedBy,
    reviewedAt: g.reviewedAt,
    inOpenAuction: !!openAuction(g),
    auctions: g.auctions.map((a) => ({ id: a.id, name: a.name, status: effectiveStatus(a), startTime: a.startTime })),
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

const listSchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  seller: z.string().trim().max(100).optional().default(''),
  categoryId: z.union([z.literal(''), z.coerce.number().int().positive()]).optional(),
  status: z.enum(['all', ...GOODS_STATUSES]).optional().default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(STAFF_GOODS_PAGE_SIZE),
});

// List: name, seller (username or full name), category and status, all combined; deleted only with status=deleted.
staffGoodsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const f = listSchema.parse(req.query);
    const has = (s: string) => ({ contains: s, mode: 'insensitive' as const });
    const and: Prisma.GoodsWhereInput[] = [f.status === 'all' ? { status: { not: 'deleted' } } : { status: f.status }];
    if (f.q) and.push({ name: has(f.q) });
    if (f.seller) and.push({ seller: { OR: [{ username: has(f.seller) }, { info: { fullName: has(f.seller) } }] } });
    if (f.categoryId) and.push({ categoryId: BigInt(f.categoryId) });
    const where = { AND: and };
    const [total, goods] = await Promise.all([
      prisma.goods.count({ where }),
      prisma.goods.findMany({ where, include: staffGoodsInclude, orderBy: { id: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    ]);
    res.json({ goods: goods.map(staffGoodsView), total, page: f.page, pageSize: f.pageSize });
  }),
);

const idParam = (raw: string) => {
  if (!/^\d+$/.test(raw)) throw new HttpError(404, 'Goods not found');
  return BigInt(raw);
};

/** Locks the row for the rest of the transaction; deleted goods are only found when `withDeleted`. */
async function lockGoods(tx: Prisma.TransactionClient, id: bigint, withDeleted = false) {
  await tx.$queryRaw`SELECT id FROM goods WHERE id = ${id} FOR UPDATE`;
  const goods = await tx.goods.findUnique({ where: { id }, include: staffGoodsInclude });
  if (!goods || (!withDeleted && goods.status === 'deleted')) throw new HttpError(404, 'Goods not found');
  return goods;
}

staffGoodsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const goods = await prisma.goods.findUnique({ where: { id: idParam(req.params.id) }, include: staffGoodsInclude });
    if (!goods) throw new HttpError(404, 'Goods not found');
    res.json({ goods: staffGoodsView(goods) });
  }),
);

// Add goods for a chosen seller (a customer); approved at once.
staffGoodsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const d = goodsSchema.extend({ seller: z.string({ required_error: 'Choose a seller' }).trim().min(1, 'Choose a seller') }).parse(req.body);
    const goods = await prisma.$transaction(async (tx) => {
      const seller = await tx.user.findFirst({ where: { OR: [{ username: d.seller }, { email: d.seller }], role: 'customer', status: { not: 'deleted' } } });
      if (!seller) throw new HttpError(400, 'Validation failed', { seller: 'No customer with that username or email' });
      const category = await checkGoodsRefs(tx, d);
      return tx.goods.create({
        data: {
          sellerId: seller.id,
          categoryId: category.id,
          name: d.name,
          description: d.description,
          condition: d.condition,
          status: 'active',
          reviewedAt: new Date(),
          reviewedById: req.user!.id,
          images: { create: d.images.map((imageUrl, sortOrder) => ({ imageUrl, sortOrder })) },
        },
        include: staffGoodsInclude,
      });
    });
    res.status(201).json({ message: 'Goods added', goods: staffGoodsView(goods) });
  }),
);

staffGoodsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const d = goodsSchema.partial().strict().parse(req.body);
    const id = idParam(req.params.id);
    const goods = await prisma.$transaction(async (tx) => {
      const current = await lockGoods(tx, id);
      if (openAuction(current)) throw new HttpError(409, IN_AUCTION_MESSAGE);
      const merged = {
        name: d.name ?? current.name,
        description: d.description ?? current.description ?? '',
        categoryId: d.categoryId ?? Number(current.categoryId),
        condition: d.condition ?? (current.condition as (typeof d)['condition'] & string),
        images: d.images ?? current.images.map((i) => i.imageUrl),
      };
      const category = await checkGoodsRefs(tx, merged);
      if (d.images) await tx.goodsImage.deleteMany({ where: { goodsId: id } });
      return tx.goods.update({
        where: { id },
        data: {
          name: merged.name,
          description: merged.description,
          categoryId: category.id,
          condition: merged.condition,
          images: d.images ? { create: d.images.map((imageUrl, sortOrder) => ({ imageUrl, sortOrder })) } : undefined,
        },
        include: staffGoodsInclude,
      });
    });
    res.json({ message: 'Goods updated', goods: staffGoodsView(goods) });
  }),
);

// Soft delete; the row stays (past auctions keep loading) and is listed under status=deleted.
staffGoodsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    await prisma.$transaction(async (tx) => {
      const current = await lockGoods(tx, id);
      if (openAuction(current)) throw new HttpError(400, DELETE_OPEN_MESSAGE);
      await tx.goods.update({ where: { id }, data: { status: 'deleted' } });
    });
    res.json({ message: 'Goods deleted' });
  }),
);

const reviewSchema = z.object({ reason: z.string().trim().max(500, 'Reason must be at most 500 characters').optional().default('') });

async function review(id: bigint, staffId: bigint, decision: 'active' | 'rejected', reason: string) {
  const goods = await prisma.$transaction(async (tx) => {
    const current = await lockGoods(tx, id);
    if (current.status !== 'pending') throw new HttpError(400, 'Only goods waiting for approval can be approved or rejected');
    return tx.goods.update({
      where: { id },
      data: { status: decision, rejectionReason: decision === 'rejected' ? reason || null : null, reviewedAt: new Date(), reviewedById: staffId },
      include: staffGoodsInclude,
    });
  });
  // After commit: the decision stands even if the mail fails (it is logged).
  const subject = decision === 'active' ? `Your goods "${goods.name}" were approved` : `Your goods "${goods.name}" were not approved`;
  const text =
    decision === 'active'
      ? `Hi ${goods.seller.username},\n\nStaff approved "${goods.name}". You can now create an auction for it from My goods.`
      : `Hi ${goods.seller.username},\n\nStaff did not approve "${goods.name}".${reason ? `\nReason: ${reason}` : ''}\n\nYou can edit the goods in My goods to send them for approval again.`;
  await sendMail(goods.seller.email, subject, text).catch((err) => console.error('goods review mail failed', err));
  return goods;
}

staffGoodsRouter.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const goods = await review(idParam(req.params.id), req.user!.id, 'active', '');
    res.json({ message: 'Goods approved', goods: staffGoodsView(goods) });
  }),
);

staffGoodsRouter.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const { reason } = reviewSchema.parse(req.body ?? {});
    const goods = await review(idParam(req.params.id), req.user!.id, 'rejected', reason);
    res.json({ message: 'Goods rejected', goods: staffGoodsView(goods) });
  }),
);
