/**
 * ui-1b.2: bid panel arithmetic. INCREMENT_LADDER is a copy of be/src/lib/increments.ts (bid-003/bid-004);
 * bidMath.test.ts uses the same vectors as be/tests/bid.increment.test.ts so the two cannot drift apart unseen.
 * The server stays the authority on every bid.
 */
export const INCREMENT_LADDER: { from: number; to: number | null; increment: number }[] = [
  { from: 0, to: 1, increment: 0.05 },
  { from: 1, to: 10, increment: 0.5 },
  { from: 10, to: 50, increment: 1 },
  { from: 50, to: 100, increment: 2.5 },
  { from: 100, to: 1000, increment: 10 },
  { from: 1000, to: null, increment: 100 },
];

const cents = (n: number) => Math.round(n * 100) / 100;

export function ladderIncrement(price: number) {
  const tier = INCREMENT_LADDER.find((t) => price >= t.from && (t.to === null || price < t.to));
  return (tier ?? INCREMENT_LADDER[0]).increment;
}

/** Multiples of the increment offered as quick buttons. */
export const QUICK_STEPS = [1, 2, 5] as const;

/**
 * Quick bid amounts: highest + k x increment(highest) for k = 1, 2, 5. Without bids the first is the starting
 * price (the minimum) and the others step up from it.
 */
export function quickAmounts(highest: number | null, initialPrice: number) {
  if (highest == null) {
    const inc = ladderIncrement(initialPrice);
    return QUICK_STEPS.map((k) => cents(initialPrice + (k - 1) * inc));
  }
  const inc = ladderIncrement(highest);
  return QUICK_STEPS.map((k) => cents(highest + k * inc));
}

/** Whole-percent change of the highest bid since the starting price; null without bids. */
export function changeSinceStart(highest: number | null, initialPrice: number) {
  if (highest == null || initialPrice <= 0) return null;
  return Math.round(((highest - initialPrice) / initialPrice) * 100);
}

/** Digits and one decimal point (at most 2 decimals) from what was typed; separators and other text dropped. */
export function cleanAmount(text: string) {
  const kept = text.replace(/[^\d.]/g, '');
  const [whole, ...rest] = kept.split('.');
  return rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

/** The typed amount with thousands separators, as shown in the input while typing. */
export function formatTyping(text: string) {
  const clean = cleanAmount(text);
  if (!clean) return '';
  const [whole, decimals] = clean.split('.');
  const grouped = (whole.replace(/^0+(?=\d)/, '') || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimals === undefined ? grouped : `${grouped}.${decimals}`;
}

/** The amount to bid: the typed value, or the minimum next bid when the input is empty. */
export function bidAmount(text: string, nextMinBid: number) {
  const clean = cleanAmount(text);
  return clean === '' || clean === '.' ? nextMinBid : Number(clean);
}

/** Client pre-check with the server's own wording (be/src/routes/bids.ts, lib/credit.ts); null when it looks fine. */
export function precheck(amount: number, nextMinBid: number, available: number) {
  if (!(amount > 0) || amount < nextMinBid) return `Bid must be at least $${nextMinBid.toFixed(2)}`;
  if (amount > available) return 'Bid exceeds your available credit';
  return null;
}
