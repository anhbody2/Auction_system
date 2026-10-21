import type { Auction, Prisma } from '@prisma/client';
import { applyCredit } from './credit';
import { publishAuctionEvent, publishAuctionFinished } from './events';

/** Locks the auction row so bids, cancels and staff changes on the same auction apply one at a time. */
export async function lockAuction(tx: Prisma.TransactionClient, id: bigint) {
  await tx.$queryRaw`SELECT id FROM auctions WHERE id = ${id} FOR UPDATE`;
  return tx.auction.findUnique({ where: { id } });
}

/**
 * Ends an open auction without a sale (sell-002 cancel, stf-006 staff delete): every held bid is released
 * with a ledger row "<reason>: <auction name>", all tickets become 'cancelled' and the auction 'cancelled'.
 * `extra` adds fields to the auction update (deletedAt for a staff delete). Returns who to notify.
 */
export async function voidAuction(tx: Prisma.TransactionClient, auction: Auction, reason: string, extra: Prisma.AuctionUpdateInput = {}) {
  const auctionId = auction.id;
  const held = await tx.bidTicket.findMany({ where: { auctionId, status: 'active' } });
  for (const t of held) {
    await applyCredit(tx, { userId: t.bidderId, type: 'release', amount: t.amount, auctionId, bidTicketId: t.id, description: `${reason}: ${auction.name}` });
  }
  const bidders = await tx.bidTicket.findMany({ where: { auctionId }, select: { bidderId: true }, distinct: ['bidderId'] });
  await tx.bidTicket.updateMany({ where: { auctionId }, data: { status: 'cancelled' } });
  await tx.auction.update({ where: { id: auctionId }, data: { status: 'cancelled', cancelledAt: new Date(), ...extra } });
  return { auctionId, name: auction.name, involved: [auction.sellerId, ...bidders.map((b) => b.bidderId)] };
}

/** After commit: credit and auction pages refresh (crd-003, cmt-001). */
export function publishVoided(v: Awaited<ReturnType<typeof voidAuction>>) {
  publishAuctionFinished(v.involved, { auctionId: v.auctionId, auctionName: v.name, reason: 'cancelled' });
  publishAuctionEvent(v.auctionId, { type: 'closed', data: { auctionId: v.auctionId, status: 'cancelled' } });
}
