import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { HttpError } from './http';
import { isStoredUpload } from './images';

export const CONDITIONS = ['new', 'like_new', 'used', 'for_parts'] as const;
export const MAX_GOODS_IMAGES = 8;

/** Derived from the goods' auctions and owner (gds-001, gds-003); 'deleted' goods are hidden everywhere (gds-002). */
export type GoodsState = 'available' | 'in_auction' | 'sold';

export const goodsInclude = {
  category: true,
  images: { orderBy: { sortOrder: 'asc' } },
  auctions: { select: { id: true, status: true }, orderBy: { id: 'desc' } },
} satisfies Prisma.GoodsInclude;

type GoodsRow = Prisma.GoodsGetPayload<{ include: typeof goodsInclude }>;

/** gds-003: the current owner is the last buyer when there is one, otherwise the seller. */
export const goodsOwnerId = (g: { sellerId: bigint; buyerId: bigint | null }) => g.buyerId ?? g.sellerId;

/**
 * State of the goods as seen by `viewerId` (their seller or buyer):
 * sold: the viewer no longer owns them (they sold them; gds-003 hands goods over to the winner).
 * in_auction: an upcoming or active auction (an active one stays so until the close job ends it).
 * Otherwise available, including after a cancelled auction, one that ended without a winner, and
 * for a buyer who won them (they can auction them again).
 */
export function goodsState(
  g: { sellerId: bigint; buyerId: bigint | null; auctions: { status: string }[] },
  viewerId: bigint,
): GoodsState {
  if (goodsOwnerId(g) !== viewerId) return 'sold';
  if (g.auctions.some((a) => a.status === 'upcoming' || a.status === 'active')) return 'in_auction';
  return 'available';
}

export function goodsView(g: GoodsRow, viewerId: bigint) {
  const state = goodsState(g, viewerId);
  const open = g.auctions.find((a) => a.status === 'upcoming' || a.status === 'active');
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    condition: g.condition,
    category: g.category ? { id: g.category.id, name: g.category.name } : null,
    images: g.images.map((i) => i.imageUrl),
    status: state,
    /** gds-003: the viewer won these goods in an auction (they show as 'Bought'). */
    bought: g.buyerId === viewerId,
    lockedReason: goodsLockReason(state),
    auctionId: open?.id ?? g.auctions[0]?.id ?? null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export const goodsSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(255),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  categoryId: z.coerce.number({ invalid_type_error: 'Choose a category' }).int().positive('Choose a category'),
  condition: z.enum(CONDITIONS, { errorMap: () => ({ message: 'Choose a condition' }) }),
  images: z
    .array(z.string().trim(), { invalid_type_error: 'Add at least one image', required_error: 'Add at least one image' })
    .min(1, 'Add at least one image')
    .max(MAX_GOODS_IMAGES, `Add at most ${MAX_GOODS_IMAGES} images`),
});

/** Checks the category exists and every image is one of this server's uploads. */
export async function checkGoodsRefs(tx: Prisma.TransactionClient, d: z.infer<typeof goodsSchema>) {
  const category = await tx.category.findUnique({ where: { id: BigInt(d.categoryId) } });
  if (!category) throw new HttpError(400, 'Validation failed', { categoryId: 'Choose a category' });
  for (const url of d.images) {
    if (!(await isStoredUpload(url))) throw new HttpError(400, 'Validation failed', { images: 'Upload the images instead of linking to them' });
  }
  return category;
}

export const IN_AUCTION_MESSAGE = 'Goods in an active auction cannot be changed';
export const SOLD_MESSAGE = 'Sold goods cannot be changed';

/** Why goods cannot be edited or deleted (gds-002), or null when they can. */
export function goodsLockReason(state: GoodsState) {
  if (state === 'in_auction') return IN_AUCTION_MESSAGE;
  if (state === 'sold') return SOLD_MESSAGE;
  return null;
}

/** gds-003: the goods a user sees in My goods: ones they sell or sold, and ones they bought. */
export const visibleGoodsWhere = (userId: bigint) =>
  ({ OR: [{ sellerId: userId }, { buyerId: userId }], status: { not: 'deleted' } }) satisfies Prisma.GoodsWhereInput;

/**
 * Locks the goods row for the rest of the transaction (so an auction cannot be created for it
 * meanwhile) and returns it with its state for this user. Goods the user neither sells nor bought,
 * and deleted goods, are 404.
 */
export async function lockOwnGoods(tx: Prisma.TransactionClient, goodsId: bigint, userId: bigint) {
  await tx.$queryRaw`SELECT id FROM goods WHERE id = ${goodsId} FOR UPDATE`;
  const goods = await tx.goods.findUnique({ where: { id: goodsId }, include: goodsInclude });
  if (!goods || (goods.sellerId !== userId && goods.buyerId !== userId) || goods.status === 'deleted') {
    throw new HttpError(404, 'Goods not found');
  }
  return { goods, state: goodsState(goods, userId) };
}

/** Like lockOwnGoods, but 409 unless the goods are available to this user. */
export async function lockChangeableGoods(tx: Prisma.TransactionClient, goodsId: bigint, userId: bigint) {
  const locked = await lockOwnGoods(tx, goodsId, userId);
  const reason = goodsLockReason(locked.state);
  if (reason) throw new HttpError(409, reason);
  return locked.goods;
}
