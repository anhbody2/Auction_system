import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { HttpError, asyncHandler } from '../lib/http';
import { checkGoodsRefs, goodsInclude, goodsSchema, goodsView, lockChangeableGoods, lockOwnGoods } from '../lib/goods';
import { requireAuth } from '../middleware/auth';

/** Seller - Manage Goods (gds-001). Mounted at /api. */
export const goodsRouter = Router();

goodsRouter.get(
  '/me/goods',
  requireAuth,
  asyncHandler(async (req, res) => {
    // sell-006: ?status=available lists only goods that can go into a new auction (the create-auction picker).
    const { status } = z.object({ status: z.enum(['available', 'in_auction', 'sold']).optional() }).parse(req.query);
    const goods = await prisma.goods.findMany({
      where: { sellerId: req.user!.id, status: { not: 'deleted' } },
      include: goodsInclude,
      orderBy: { id: 'desc' },
    });
    const views = goods.map(goodsView);
    res.json({ goods: status ? views.filter((g) => g.status === status) : views });
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
          categoryId: category.id,
          name: d.name,
          description: d.description,
          condition: d.condition,
          images: { create: d.images.map((imageUrl, sortOrder) => ({ imageUrl, sortOrder })) },
        },
        include: goodsInclude,
      });
    });
    res.status(201).json({ goods: goodsView(goods) });
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
    res.json({ goods: goodsView(goods.goods) });
  }),
);

// gds-002: any field may be sent; images, when sent, replace the current list.
goodsRouter.patch(
  '/goods/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const d = goodsSchema.partial().strict().parse(req.body);
    const id = idParam(req.params.id);
    const goods = await prisma.$transaction(async (tx) => {
      const current = await lockChangeableGoods(tx, id, req.user!.id);
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
        include: goodsInclude,
      });
    });
    res.json({ message: 'Goods updated', goods: goodsView(goods) });
  }),
);

// Soft delete: auctions.goods_id still references the row, so past auctions keep loading.
goodsRouter.delete(
  '/goods/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = idParam(req.params.id);
    await prisma.$transaction(async (tx) => {
      await lockChangeableGoods(tx, id, req.user!.id);
      await tx.goods.update({ where: { id }, data: { status: 'deleted' } });
    });
    res.json({ message: 'Goods deleted' });
  }),
);
