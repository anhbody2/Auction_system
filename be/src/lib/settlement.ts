import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { applyCredit } from './credit';

export const COMMISSION_RATE = new Prisma.Decimal(process.env.COMMISSION_RATE ?? '0.05');

/**
 * Closes one auction whose end time has passed. Idempotent: the auction row is locked and
 * re-checked, so concurrent callers settle it exactly once.
 *  - leading bid meets reserve -> ticket won, winner pays from held credit, seller receives amount minus commission
 *  - otherwise                -> leading hold released, ticket lost
 *  - every other non-cancelled ticket becomes lost
 */
export async function settleAuction(auctionId: bigint) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM auctions WHERE id = ${auctionId} FOR UPDATE`;
    const auction = await tx.auction.findUnique({ where: { id: auctionId } });
    if (!auction || auction.status === 'cancelled' || auction.status === 'ended' || auction.endTime > new Date()) return false;

    const now = new Date();
    const leading = await tx.bidTicket.findFirst({ where: { auctionId, status: 'active' }, orderBy: { amount: 'desc' } });
    const reserveMet = !auction.reservePrice || (leading && leading.amount.greaterThanOrEqualTo(auction.reservePrice));

    let winnerId: bigint | null = null;
    if (leading && reserveMet) {
      winnerId = leading.bidderId;
      const commission = leading.amount.times(COMMISSION_RATE).toDecimalPlaces(2);
      await tx.bidTicket.update({ where: { id: leading.id }, data: { status: 'won', wonAt: now } });
      await applyCredit(tx, { userId: leading.bidderId, type: 'payment', amount: leading.amount, auctionId, bidTicketId: leading.id, description: `Won: ${auction.name}` });
      await applyCredit(tx, {
        userId: auction.sellerId,
        type: 'payout',
        amount: leading.amount.minus(commission),
        auctionId,
        bidTicketId: leading.id,
        description: `Sold: ${auction.name} (commission ${commission.toFixed(2)})`,
      });
      await tx.auctionSettlement.create({
        data: { auctionId, winningBidId: leading.id, commissionAmount: commission, settlementStatus: 'settled', settledAt: now },
      });
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
    return true;
  });
}

/** Settles every auction whose end time has passed. Cheap when nothing is due (indexed on status, end_time). */
export async function closeDueAuctions() {
  const due = await prisma.auction.findMany({
    where: { status: { in: ['active', 'upcoming'] }, endTime: { lte: new Date() } },
    select: { id: true },
    take: 50,
  });
  for (const { id } of due) await settleAuction(id);
  return due.length;
}
