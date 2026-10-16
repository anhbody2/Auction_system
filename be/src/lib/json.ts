import { Prisma } from '@prisma/client';

// Express JSON replacer: BigInt ids and Prisma Decimals become plain numbers.
export function jsonReplacer(this: Record<string, unknown>, key: string, value: unknown) {
  const original = this[key];
  if (Prisma.Decimal.isDecimal(original)) return (original as Prisma.Decimal).toNumber();
  if (typeof value === 'bigint') return Number(value);
  return value;
}
