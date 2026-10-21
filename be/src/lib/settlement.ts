import { prisma } from '../db';
import { commissionFor, commissionRate } from './commission';
import { applyCredit } from './credit';
import { publishAuctionEvent, publishAuctionFinished } from './events';

/**
 * Closes one auction whose end time has passed. Idempotent: the auction row is locked and
 * re-checked, so concurrent callers settle it exactly once.
 *  - leading bid meets reserve -> ticket won, winner pays from held credit, seller receives amount minus tiered commission
 *  - otherwise                -> leading hold released, ticket lost
 *  - every other non-cancelled ticket becomes lost
 *  - on a sale the goods get buyer = winner, seller = this auction's seller (gds-003)
 */
export async function settleAuction(auctionId: bigint) {
  const finished = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM auctions WHERE id = ${auctionId} FOR UPDATE`;
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.status === 'cancelled' || auction.status === 'ended' || auction.endTime > new Date()) return null;

    const now = new Date();
    const leading = await tx.bidTicket.findFirst({ where: { auctionId, status: 'active' }, orderBy: { amount: 'desc' } });
    const reserveMet = !auction.reservePrice || (leading && leading.amount.greaterThanOrEqualTo(auction.reservePrice));

    let winnerId: bigint | null = null;
    if (leading && reserveMet) {
      winnerId = leading.bidderId;
      const commission = commissionFor(leading.amount);
      await tx.bidTicket.update({ where: { id: leading.id }, data: { status: 'won', wonAt: now } });
      await applyCredit(tx, { userId: leading.bidderId, type: 'payment', amount: leading.amount, auctionId, bidTicketId: leading.id, description: `Won: ${auction.name}` });
      await applyCredit(tx, {
        userId: auction.sellerId,
        type: 'payout',
        amount: leading.amount.minus(commission),
        auctionId,
        bidTicketId: leading.id,
        description: `Sold: ${auction.name} (commission $${commission.toFixed(2)}, ${commissionRate(leading.amount).times(100).toNumber()}%)`,
      });
      await tx.auctionSettlement.create({
        data: { auctionId, winningBidId: leading.id, commissionAmount: commission, settlementStatus: 'settled', settledAt: now },
      });
      // gds-003: the goods pass to the winner. On a resale the reseller (previous buyer) becomes the seller.
      await tx.goods.update({ where: { id: auction.goodsId }, data: { sellerId: auction.sellerId, buyerId: winnerId } });
    } else {
      if (leading) {
        await tx.bidTicket.update({ where: { id: leading.id }, data: { status: 'lost' } });
        await applyCredit(tx, { userId: leading.bidderId, type: 'release', amount: leading.amount, auctionId, bidTicketId: leading.id, description: `Reserve not met: ${auction.name}` });
      }
      await tx.auctionSettlement.create({
        data: { auctionId, settlementStatus: leading ? 'reserve_not_met' : 'no_bids', settledAt: now },
      });
    }

    await tx.bidTicket.updateMany({ where: { auctionId, status: { in: ['active', 'outbid'] } }, data: { status: 'lost' } });
    await tx.auction.update({ where: { id: auctionId }, data: { status: 'ended', closedAt: now, winnerId } });
    const bidders = await tx.bidTicket.findMany({ where: { auctionId }, select: { bidderId: true }, distinct: ['bidderId'] });
    return { name: auction.name, involved: [auction.sellerId, ...bidders.map((b) => b.bidderId)] };
  });
  if (!finished) return false;
  // crd-003: after commit, so a client that refetches its credit sees the settled balances.
  publishAuctionFinished(finished.involved, { auctionId, auctionName: finished.name, reason: 'ended' });
  // cmt-001: open auction pages reload and close their comment box.
  publishAuctionEvent(auctionId, { type: 'closed', data: { auctionId, status: 'ended' } });
  return true;
}

/**
 * Close auction job (sys-002): settles every auction whose close date (start + duration = end_time)
 * has passed, in batches of `batchSize` until none are left. Returns how many this call settled.
 * Cheap when nothing is due (indexed on status, end_time).
 */
export async function closeDueAuctions(batchSize = 50) {
  let settled = 0;
  for (;;) {
    const due = await prisma.auction.findMany({
      where: { status: { in: ['active', 'upcoming'] }, endTime: { lte: new Date() } },
      select: { id: true },
      orderBy: { endTime: 'asc' },
      take: batchSize,
    });
    for (const { id } of due) if (await settleAuction(id)) settled++;
    if (due.length < batchSize) return settled;
  }
}
