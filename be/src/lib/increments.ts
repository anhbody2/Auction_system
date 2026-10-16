import { Prisma } from '@prisma/client';

/** Bid increment ladder (bid-003). Lower bound inclusive, upper bound exclusive; `to: null` is open-ended. */
export const INCREMENT_LADDER: { from: number; to: number | null; increment: number }[] = [
  { from: 0, to: 1, increment: 0.05 },
  { from: 1, to: 10, increment: 0.5 },
  { from: 10, to: 50, increment: 1 },
  { from: 50, to: 100, increment: 2.5 },
  { from: 100, to: 500, increment: 5 },
  { from: 500, to: 1000, increment: 10 },
  { from: 1000, to: 5000, increment: 25 },
  { from: 5000, to: null, increment: 100 },
];

/** Increment the ladder prescribes for a current price. */
export function ladderIncrement(price: Prisma.Decimal.Value): Prisma.Decimal {
  const p = new Prisma.Decimal(price);
  const tier = INCREMENT_LADDER.find((t) => p.greaterThanOrEqualTo(t.from) && (t.to === null || p.lessThan(t.to)));
  return new Prisma.Decimal((tier ?? INCREMENT_LADDER[0]).increment);
}
