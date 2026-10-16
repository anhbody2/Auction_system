import { Prisma } from '@prisma/client';
import { prisma } from '../db';

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

let cachedRules: { min: Prisma.Decimal; max: Prisma.Decimal | null; inc: Prisma.Decimal }[] | null = null;

async function incrementRules() {
  if (!cachedRules) {
    const rules = await prisma.bidIncrementRule.findMany({ where: { status: 'active' }, orderBy: { minBidAmount: 'asc' } });
    cachedRules = rules.map((r) => ({ min: r.minBidAmount, max: r.maxBidAmount, inc: r.incrementAmount }));
  }
  return cachedRules;
}

/** Increment to apply above `price`: the auction's own min_increment, else BID_INCREMENT_RULES, else 1. */
export async function incrementFor(a: { minIncrement: Prisma.Decimal | null }, price: Prisma.Decimal) {
  if (a.minIncrement) return a.minIncrement;
  const rule = (await incrementRules()).find((r) => price.greaterThanOrEqualTo(r.min) && (!r.max || price.lessThan(r.max)));
  return rule?.inc ?? new Prisma.Decimal(1);
}

/** Smallest acceptable next bid. */
export async function nextMinBid(a: { initialPrice: Prisma.Decimal; currentPrice: Prisma.Decimal | null; minIncrement: Prisma.Decimal | null }) {
  if (!a.currentPrice) return a.initialPrice;
  return a.currentPrice.plus(await incrementFor(a, a.currentPrice));
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
    minIncrement: a.minIncrement,
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
