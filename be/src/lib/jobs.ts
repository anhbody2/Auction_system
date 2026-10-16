import { prisma } from '../db';

/**
 * Start auction job (sys-001): every 'upcoming' auction whose start time has arrived becomes 'active'.
 * A single UPDATE, so repeated or concurrent runs are harmless. Returns how many auctions were started.
 */
export async function startDueAuctions(now = new Date()) {
  const { count } = await prisma.auction.updateMany({
    where: { status: 'upcoming', startTime: { lte: now } },
    data: { status: 'active' },
  });
  return count;
}
