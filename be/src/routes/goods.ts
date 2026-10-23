import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { publishGoodsRequest } from '../lib/approvalEvents';
import { HttpError, asyncHandler } from '../lib/http';
import { checkGoodsRefs, goodsInclude, goodsSchema, goodsView, lockChangeableGoods, lockOwnGoods, visibleGoodsWhere } from '../lib/goods';
import { requireAuth } from '../middleware/auth';

/** Seller - Manage Goods (gds-001). Mounted at /api. */
export const goodsRouter = Router();

goodsRouter.get(
  '/me/goods',
  requireAuth,
  asyncHandler(async (req, res) => {
    // sell-006: ?status=available lists only goods that can go into a new auction (the create-auction picker).
    const { status } = z.object({ status: z.enum(['pending', 'rejected', 'available', 'in_auction', 'sold']).optional() }).parse(req.query);
    const goods = await prisma.goods.findMany({
      where: visibleGoodsWhere(req.user!.id),
      include: goodsInclude,
      orderBy: { id: 'desc' },
    });
    const views = goods.map((g) => goodsView(g, req.user!.id));
    res.json({ goods: status ? views.filter((g) => g.status === status) : views });
  }),
);

/**
 * ui-2a.2: goods the user won at auction and still owns (gds-003 makes the buyer the owner; selling them on
 * moves buyer_id to the next winner, so they leave this list). Each carries the winning price and date.
 */
goodsRouter.get(
  '/me/goods/owned',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.id;
    const goods = await prisma.goods.findMany({
      where: { buyerId: me, status: { not: 'deleted' } },
      include: goodsInclude,
      orderBy: { id: 'desc' },
    });
    const won = await prisma.auction.findMany({
      where: { goodsId: { in: goods.map((g) => g.id) }, winnerId: me },
      select: { goodsId: true, currentPrice: true, closedAt: true, endTime: true },
      orderBy: { endTime: 'desc' },
    });
    const wonFor = new Map<bigint, (typeof won)[number]>();
    for (const w of won) if (!wonFor.has(w.goodsId)) wonFor.set(w.goodsId, w);
    const items = goods.map((g) => {
      const w = wonFor.get(g.id);
      return { ...goodsView(g, me), wonPrice: w?.currentPrice ?? null, wonAt: w ? (w.closedAt ?? w.endTime) : null };
    });
    // Most recently won first.
    items.sort((x, y) => (y.wonAt?.getTime() ?? 0) - (x.wonAt?.getTime() ?? 0));
    res.json({ goods: items });
  }),
);

goodsRouter.post(
  '/goods',
  requireAuth,
  asyncHandler(async (req, res) => {
    const d = goodsSchema.parse(req.body);
    const goods = await prisma.$transaction(async (tx) => {
      const category = await checkGoodsRefs(tx, d);
      return tx.goods.create({
        data: {
          sellerId: req.user!.id,
          // stf-005: customer goods wait for staff approval before they can be auctioned.
          status: 'pending',
          categoryId: category.id,
          name: d.name,
          description: d.description,
          condition: d.condition,
          images: { create: d.images.map((imageUrl, sortOrder) => ({ imageUrl, sortOrder })) },
        },
        include: goodsInclude,
      });
    });
    // stf-009: a new request in the staff goods queue.
    await publishGoodsRequest('created', { ...goods, seller: req.user! });
    res.status(201).json({ goods: goodsView(goods, req.user!.id) });
  }),
);

const idParam = (raw: string) => {
  if (!/^\d+$/.test(raw)) throw new HttpError(404, 'Goods not found');
  return BigInt(raw);
};

goodsRouter.get(
  '/goods/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const goods = await prisma.$transaction((tx) => lockOwnGoods(tx, idParam(req.params.id), req.user!.id));
    res.json({ goods: goodsView(goods.goods, req.user!.id) });
  }),
);

// gds-002: any field may be sent; images, when sent, replace the current list.
goodsRouter.patch(
  '/goods/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const d = goodsSchema.partial().strict().parse(req.body);
    const id = idParam(req.params.id);
    let resubmitted = false;
    const goods = await prisma.$transaction(async (tx) => {
      const current = await lockChangeableGoods(tx, id, req.user!.id);
      resubmitted = current.status === 'rejected';
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
          // stf-005: fixing rejected goods sends them back for approval.
          ...(current.status === 'rejected' ? { status: 'pending', rejectionReason: null } : {}),
        },
        include: goodsInclude,
      });
    });
    if (resubmitted) await publishGoodsRequest('resubmitted', { ...goods, seller: req.user! });
    res.json({ message: 'Goods updated', goods: goodsView(goods, req.user!.id) });
  }),
);

// Soft delete: auctions.goods_id still references the row, so past auctions keep loading.
goodsRouter.delete(
  '/goods/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    const before = await prisma.$transaction(async (tx) => {
      const current = await lockChangeableGoods(tx, id, req.user!.id);
      await tx.goods.update({ where: { id }, data: { status: 'deleted' } });
      return current;
    });
    // stf-009: a request withdrawn by its seller leaves the staff queue.
    if (before.status === 'pending') await publishGoodsRequest('deleted', { ...before, status: 'deleted', seller: req.user! });
    res.json({ message: 'Goods deleted' });
  }),
);
