import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { rangeBounds, type StatFilter } from './statistics';

type Range = Pick<StatFilter, 'from' | 'to' | 'tz'>;

/** stf-004: system revenue = commission on sales settled in the range (by settled_at). */
export async function revenueStatistics(f: Range) {
  const settled = await prisma.auctionSettlement.findMany({
    where: { settlementStatus: 'settled', settledAt: rangeBounds(f) },
    include: { winningBid: { select: { amount: true } } },
  });
  const zero = new Prisma.Decimal(0);
  return {
    totalCommission: settled.reduce((s, x) => s.plus(x.commissionAmount), zero),
    totalSales: settled.reduce((s, x) => s.plus(x.winningBid?.amount ?? 0), zero),
    settledCount: settled.length,
  };
}

interface Ranked {
  username: string;
  value: Prisma.Decimal;
  count: number;
}

function top5(map: Map<string, Ranked>) {
  return [...map.values()]
    .sort((a, b) => b.value.comparedTo(a.value) || b.count - a.count || a.username.localeCompare(b.username))
    .slice(0, 5);
}

/**
 * stf-004: customer figures for the range.
 *  - registrations: customer accounts created in the range
 *  - activeBidders / activeSellers: distinct users who placed a bid / whose auction started in the range
 *  - topSellers / topBidders: by value of sales settled in the range (seller proceeds before commission / winning bids)
 */
export async function customerStatistics(f: Range) {
  const range = rangeBounds(f);
  const [registrations, bidders, sellers, sales] = await Promise.all([
    prisma.user.count({ where: { role: 'customer', createdAt: range } }),
    prisma.bidTicket.findMany({ where: { createdAt: range }, distinct: ['bidderId'], select: { bidderId: true } }),
    prisma.auction.findMany({ where: { startTime: range }, distinct: ['sellerId'], select: { sellerId: true } }),
    prisma.auctionSettlement.findMany({
      where: { settlementStatus: 'settled', settledAt: range },
      include: {
        auction: { select: { seller: { select: { username: true } } } },
        winningBid: { select: { amount: true, bidder: { select: { username: true } } } },
      },
    }),
  ]);

  const sellerMap = new Map<string, Ranked>();
  const bidderMap = new Map<string, Ranked>();
  const add = (map: Map<string, Ranked>, username: string, amount: Prisma.Decimal) => {
    const row = map.get(username) ?? { username, value: new Prisma.Decimal(0), count: 0 };
    row.value = row.value.plus(amount);
    row.count += 1;
    map.set(username, row);
  };
  for (const s of sales) {
    if (!s.winningBid) continue;
    add(sellerMap, s.auction.seller.username, s.winningBid.amount);
    add(bidderMap, s.winningBid.bidder.username, s.winningBid.amount);
  }

  return {
    registrations,
    activeBidders: bidders.length,
    activeSellers: sellers.length,
    topSellers: top5(sellerMap),
    topBidders: top5(bidderMap),
  };
}
