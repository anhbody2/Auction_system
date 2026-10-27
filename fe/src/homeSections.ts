import type { Auction } from './api';

/**
 * home-1.2 / home-2.2: the homepage shows two sections from one GET /api/auctions answer, which lists the
 * trending (live) lots first and the just-completed lots after them, each in the server's order.
 */
export function splitSections(auctions: Auction[]) {
  return {
    trending: auctions.filter((a) => a.status === 'active'),
    completed: auctions.filter((a) => a.status === 'ended'),
  };
}

/** '1 live auction' / '1,284 live auctions'. */
export const liveCountLabel = (n: number) => `${n.toLocaleString('en-US')} live auction${n === 1 ? '' : 's'}`;
