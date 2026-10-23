import type { Auction } from './api';

/** One row of GET /api/me/bids (cust-007). */
export interface MyBidItem {
  auction: Auction;
  myLatestBid: number;
  myLatestBidAt: string;
  myStatus: 'winning' | 'outbid' | 'won' | 'lost' | 'cancelled';
}

export type MyAuctionsTab = 'bidding' | 'selling' | 'ended';

export type EndedResult = 'won' | 'lost' | 'sold' | 'unsold';

export interface EndedRow {
  auction: Auction;
  side: 'bidder' | 'seller';
  result: EndedResult;
  myBid: number | null;
}

/** ui-2a.3: the Ended tab shows this many recently ended auctions from both sides. */
export const ENDED_LIMIT = 10;

/**
 * ui-2a.3: the dashboard's My auctions tabs. Bidding = live auctions I bid on (leading or outbid), most
 * recently bid first; Selling = my own active and upcoming auctions, soonest ending first; Ended = the last
 * ENDED_LIMIT ended auctions from both sides, newest first (won / lost as a bidder, sold / unsold as seller).
 */
export function myAuctionsTabs(bids: MyBidItem[], mine: Auction[]) {
  const bidding = bids.filter((b) => b.myStatus === 'winning' || b.myStatus === 'outbid');
  const selling = mine
    .filter((a) => a.status === 'active' || a.status === 'upcoming')
    .sort((x, y) => Date.parse(x.endTime) - Date.parse(y.endTime));
  const ended: EndedRow[] = [
    ...bids
      .filter((b) => b.myStatus === 'won' || b.myStatus === 'lost')
      .map((b): EndedRow => ({ auction: b.auction, side: 'bidder', result: b.myStatus as 'won' | 'lost', myBid: b.myLatestBid })),
    ...mine.filter((a) => a.status === 'ended').map((a): EndedRow => ({ auction: a, side: 'seller', result: a.winner ? 'sold' : 'unsold', myBid: null })),
  ]
    .sort((x, y) => Date.parse(y.auction.endTime) - Date.parse(x.auction.endTime))
    .slice(0, ENDED_LIMIT);
  return { bidding, selling, ended };
}

export const RESULT_LABELS: Record<EndedResult, string> = { won: 'Won', lost: 'Lost', sold: 'Sold', unsold: 'Unsold' };

export const isTab = (v: string | null): v is MyAuctionsTab => v === 'bidding' || v === 'selling' || v === 'ended';
