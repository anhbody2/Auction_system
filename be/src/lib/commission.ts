import { Prisma } from '@prisma/client';

/** System commission tiers (sys-003) on the winning price. Lower bound inclusive; `to: null` is open-ended. */
export const COMMISSION_TIERS: { from: number; to: number | null; rate: number }[] = [
  { from: 0, to: 100, rate: 0.1 },
  { from: 100, to: 1000, rate: 0.05 },
  { from: 1000, to: 10000, rate: 0.02 },
  { from: 10000, to: null, rate: 0.01 },
];

export function commissionRate(price: Prisma.Decimal.Value): Prisma.Decimal {
  const p = new Prisma.Decimal(price);
  const tier = COMMISSION_TIERS.find((t) => p.greaterThanOrEqualTo(t.from) && (t.to === null || p.lessThan(t.to)));
  return new Prisma.Decimal((tier ?? COMMISSION_TIERS[0]).rate);
}

/** Commission on a winning price, rounded half-up to cents. */
export function commissionFor(price: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(price).times(commissionRate(price)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
