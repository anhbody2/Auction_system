import type { Auction } from '../api';

/** ui-1a.1: an active auction with less than this left gets the dark red 'ending soon' pill. */
export const ENDING_SOON_MS = 60 * 60 * 1000;

type CardAuction = Pick<Auction, 'status' | 'currentPrice' | 'winner' | 'endTime' | 'isOwner' | 'myBid'>;

/** Label above the big price: 'Highest bid' / 'Starting at' while open; home-2.2: 'Winning bid' / 'Final price' once ended. */
export function priceLabel(a: CardAuction) {
  if (a.status === 'ended') return a.winner ? 'Winning bid' : 'Final price';
  return a.currentPrice ? 'Highest bid' : 'Starting at';
}

export function isEndingSoon(a: CardAuction, now = Date.now()) {
  const left = new Date(a.endTime).getTime() - now;
  return a.status === 'active' && left > 0 && left < ENDING_SOON_MS;
}

export type StripState = 'leading' | 'outbid' | 'none';

/** The viewer's own position on a live card; null when no strip is shown (guest, seller, not live). */
export function stripState(a: CardAuction, signedIn: boolean): StripState | null {
  if (!signedIn || a.isOwner || a.status !== 'active') return null;
  return a.myBid?.status ?? 'none';
}
