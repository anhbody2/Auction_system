import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { dateField, localDay, rangeBounds } from './statistics';

/** trx-001: how far back the transaction search may go. */
export const SEARCH_WINDOW_DAYS = 30;
export const WINDOW_MESSAGE = `Date must be within the last ${SEARCH_WINDOW_DAYS} days`;
export const MIN_AMOUNT_MESSAGE = 'Minimum amount must be at least $1';
export const MAX_AMOUNT_MESSAGE = 'Maximum amount must be at least the minimum';
const DAY_MS = 24 * 3600 * 1000;

const optionalText = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((s) => s || undefined);
const optionalAmount = (message: string) =>
  z
    .union([z.literal(''), z.coerce.number({ invalid_type_error: message }).finite()])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v));

/** Earliest local day the search accepts (today minus the window), as YYYY-MM-DD. */
export const earliestDay = (tz: number, now = new Date()) => localDay(new Date(now.getTime() - SEARCH_WINDOW_DAYS * DAY_MS), tz);

/**
 * Filters shared by the customer search (trx-001) and the staff list (stf-008). Every filter given applies
 * together (AND). Dates are whole local days of the client (`tz` = getTimezoneOffset()), both inclusive.
 * Missing dates default to the last 30 days; a missing max means no upper bound.
 */
export function transactionFilterSchema(now = new Date()) {
  return z
    .object({
      tz: z.coerce.number().int().min(-840).max(840).default(0),
      from: dateField('From').optional(),
      to: dateField('To').optional(),
      name: optionalText,
      id: z
        .string()
        .trim()
        .optional()
        .transform((s) => s || undefined)
        .refine((s) => s === undefined || /^\d{1,18}$/.test(s), 'Transaction id must be a number'),
      min: optionalAmount(MIN_AMOUNT_MESSAGE),
      max: optionalAmount(MAX_AMOUNT_MESSAGE),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    })
    .transform((f) => ({ ...f, from: f.from ?? earliestDay(f.tz, now), to: f.to ?? localDay(now, f.tz) }))
    .superRefine((f, ctx) => {
      const earliest = earliestDay(f.tz, now);
      if (f.from < earliest) ctx.addIssue({ code: 'custom', path: ['from'], message: WINDOW_MESSAGE });
      if (f.to < earliest) ctx.addIssue({ code: 'custom', path: ['to'], message: WINDOW_MESSAGE });
      if (f.to > localDay(now, f.tz)) ctx.addIssue({ code: 'custom', path: ['to'], message: 'To date cannot be in the future' });
      if (f.from > f.to) ctx.addIssue({ code: 'custom', path: ['from'], message: 'From date must be on or before To date' });
      if (f.min !== undefined && f.min < 1) ctx.addIssue({ code: 'custom', path: ['min'], message: MIN_AMOUNT_MESSAGE });
      if (f.max !== undefined && f.max < (f.min ?? 1)) ctx.addIssue({ code: 'custom', path: ['max'], message: f.min === undefined ? 'Maximum amount must be at least $1' : MAX_AMOUNT_MESSAGE });
    });
}

export type TransactionFilter = z.output<ReturnType<typeof transactionFilterSchema>>;

/** The WHERE for a filter; `extra` adds caller conditions (the signed-in user, or staff filters). */
export function transactionWhere(f: TransactionFilter, extra: Prisma.CreditTransactionWhereInput[] = []): Prisma.CreditTransactionWhereInput {
  const has = f.name ? { contains: f.name, mode: 'insensitive' as const } : undefined;
  const and: Prisma.CreditTransactionWhereInput[] = [{ createdAt: rangeBounds(f) }, ...extra];
  if (has) and.push({ OR: [{ auction: { name: has } }, { description: has }] });
  if (f.id) and.push({ id: BigInt(f.id) });
  if (f.min !== undefined || f.max !== undefined) and.push({ amount: { gte: f.min, lte: f.max } });
  return { AND: and };
}

export const transactionInclude = { auction: { select: { id: true, name: true } } } satisfies Prisma.CreditTransactionInclude;

/** Runs the count and the page query in parallel. */
export async function searchTransactions(
  f: TransactionFilter,
  extra: Prisma.CreditTransactionWhereInput[] = [],
  include: Prisma.CreditTransactionInclude = transactionInclude,
) {
  const where = transactionWhere(f, extra);
  const [total, transactions] = await Promise.all([
    prisma.creditTransaction.count({ where }),
    prisma.creditTransaction.findMany({ where, include, orderBy: { id: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
  ]);
  return { transactions, total, page: f.page, pageSize: f.pageSize, from: f.from, to: f.to };
}
