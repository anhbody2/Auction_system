import { Prisma } from '@prisma/client';
import { ladderIncrement } from './increments';

export type AuctionStatus = 'upcoming' | 'active' | 'ended' | 'cancelled';

export const auctionInclude = {
  seller: { select: { id: true, username: true } },
  winner: { select: { id: true, username: true } },
  goods: { include: { category: true, images: { orderBy: { sortOrder: 'asc' } } } },
  _count: { select: { bids: true } },
} satisfies Prisma.AuctionInclude;

export type AuctionWithRelations = Prisma.AuctionGetPayload<{ include: typeof auctionInclude }>;

export function effectiveStatus(a: { status: string; startTime: Date; endTime: Date }, now = new Date()): AuctionStatus {
  if (a.status === 'cancelled') return 'cancelled';
  if (a.status === 'ended' || now >= a.endTime) return 'ended';
  if (now < a.startTime) return 'upcoming';
  return 'active';
}

/** Smallest acceptable next bid: the starting price, then the current price plus the ladder increment. */
export async function nextMinBid(a: { initialPrice: Prisma.Decimal; currentPrice: Prisma.Decimal | null }) {
  if (!a.currentPrice) return a.initialPrice;
  return a.currentPrice.plus(ladderIncrement(a.currentPrice));
}

/** Public JSON shape. The reserve price is only revealed to the seller. */
export async function auctionView(a: AuctionWithRelations, viewerId?: bigint) {
  const isOwner = viewerId !== undefined && viewerId === a.sellerId;
  const status = effectiveStatus(a);
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    seller: a.seller,
    isOwner,
    goods: {
      id: a.goods.id,
      name: a.goods.name,
      condition: a.goods.condition,
      category: a.goods.category ? { id: a.goods.category.id, name: a.goods.category.name } : null,
      images: a.goods.images.map((i) => i.imageUrl),
    },
    initialPrice: a.initialPrice,
    reservePrice: isOwner ? a.reservePrice : undefined,
    hasReserve: !!a.reservePrice,
    reserveMet: !a.reservePrice || (!!a.currentPrice && a.currentPrice.greaterThanOrEqualTo(a.reservePrice)),
    currentPrice: a.currentPrice,
    nextMinBid: status === 'active' || status === 'upcoming' ? await nextMinBid(a) : null,
    bidCount: a._count.bids,
    startTime: a.startTime,
    endTime: a.endTime,
    durationMinutes: a.durationMinutes,
    status,
    winner: a.winner,
    cancelledAt: a.cancelledAt,
    closedAt: a.closedAt,
    createdAt: a.createdAt,
  };
}
