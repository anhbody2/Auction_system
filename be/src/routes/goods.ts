import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/http';
import { checkGoodsRefs, goodsInclude, goodsSchema, goodsView } from '../lib/goods';
import { requireAuth } from '../middleware/auth';

/** Seller - Manage Goods (gds-001). Mounted at /api. */
export const goodsRouter = Router();

goodsRouter.get(
  '/me/goods',
  requireAuth,
  asyncHandler(async (req, res) => {
    const goods = await prisma.goods.findMany({
      where: { sellerId: req.user!.id, status: { not: 'deleted' } },
      include: goodsInclude,
      orderBy: { id: 'desc' },
    });
    res.json({ goods: goods.map(goodsView) });
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
