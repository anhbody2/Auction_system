import type { Auction } from './api';

export type MyStatus = 'winning' | 'outbid' | 'won' | 'lost' | 'cancelled';
export type CreditState = 'locked' | 'charged' | 'released' | 'none';

/** One row of GET /api/me/bids (cust-007, ui-3a.1). */
export interface BidHistoryItem {
  auction: Auction;
  myLatestBid: number;
  myLatestBidAt: string;
  myStatus: MyStatus;
  bidCount: number;
  creditState: CreditState;
}

export interface BidTotals {
  bidsPlaced: number;
  won: number;
  lost: number;
}

/** ui-3a.1: win rate over finished lots, whole percent; '-' before any lot is won or lost. */
export function winRate(t: Pick<BidTotals, 'won' | 'lost'>) {
  const finished = t.won + t.lost;
  return finished ? `${Math.round((t.won / finished) * 100)}%` : '-';
}

/** Result pill text and tone; the API keeps 'winning', the page says 'Leading'. */
export const RESULT: Record<MyStatus, { label: string; tone: 'navy' | 'steel' | 'cream' | 'muted' }> = {
  won: { label: 'Won', tone: 'navy' },
  winning: { label: 'Leading', tone: 'steel' },
  outbid: { label: 'Outbid', tone: 'cream' },
  lost: { label: 'Lost', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const CREDIT_LABELS: Record<CreditState, string> = { locked: 'Locked', charged: 'Charged', released: 'Released', none: '-' };
