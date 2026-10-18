import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { effectiveStatus, type AuctionStatus } from './auctions';

export const STAT_STATUSES = ['all', 'upcoming', 'active', 'ended', 'cancelled'] as const;
export type StatStatus = (typeof STAT_STATUSES)[number];

const DAY_MS = 24 * 3600 * 1000;
const dateField = (label: string) =>
  z
    .string({ required_error: `${label} date is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} date must be YYYY-MM-DD`)
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), `${label} date is not a valid date`);

/**
 * Filter shared by the staff list, export and chart endpoints.
 * `tz` is the client's Date.getTimezoneOffset() in minutes (e.g. -420 for UTC+7) so that
 * "from" and "to" are whole local days, both inclusive. Defaults to UTC.
 */
export const statFilterSchema = z
  .object({
    from: dateField('From'),
    to: dateField('To'),
    status: z.enum(STAT_STATUSES, { errorMap: () => ({ message: `Status must be one of ${STAT_STATUSES.join(', ')}` }) }).default('all'),
    tz: z.coerce.number().int().min(-840).max(840).default(0),
  })
  .refine((f) => f.from <= f.to, { path: ['from'], message: 'From date must be on or before To date' });

export type StatFilter = z.infer<typeof statFilterSchema>;

/** UTC instant where local day `date` starts, for a client whose getTimezoneOffset() is `tz`. */
export function localDayStart(date: string, tz: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + tz * 60_000);
}

/** Local calendar day (YYYY-MM-DD) of an instant, for the same client offset. */
export function localDay(d: Date, tz: number) {
  return new Date(d.getTime() - tz * 60_000).toISOString().slice(0, 10);
}

export function rangeBounds(f: Pick<StatFilter, 'from' | 'to' | 'tz'>) {
  return { gte: localDayStart(f.from, f.tz), lt: new Date(localDayStart(f.to, f.tz).getTime() + DAY_MS) };
}

export interface StatRow {
  id: bigint;
  title: string;
  seller: string;
  startTime: Date;
  endTime: Date;
  status: AuctionStatus;
  startingPrice: Prisma.Decimal;
  finalPrice: Prisma.Decimal | null;
  winner: string | null;
  commission: Prisma.Decimal | null;
}

export interface StatSummary {
  count: number;
  totalStartingPrice: Prisma.Decimal;
  totalFinalPrice: Prisma.Decimal;
  totalCommission: Prisma.Decimal;
}

/**
 * stf-001: auctions whose start time falls in the range (assumption: the SRS does not say which date),
 * filtered on the effective status the rest of the app shows.
 */
export async function auctionStatistics(f: StatFilter, now = new Date()) {
  const auctions = await prisma.auction.findMany({
    where: { startTime: rangeBounds(f) },
    include: { seller: { select: { username: true } }, winner: { select: { username: true } }, settlement: true },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
  });
  const rows: StatRow[] = auctions
    .map((a) => {
      const status = effectiveStatus(a, now);
      const sold = status === 'ended' && a.winnerId !== null;
      return {
        id: a.id,
        title: a.name,
        seller: a.seller.username,
        startTime: a.startTime,
        endTime: a.endTime,
        status,
        startingPrice: a.initialPrice,
        finalPrice: sold ? a.currentPrice : null,
        winner: sold ? (a.winner?.username ?? null) : null,
        commission: a.settlement?.settlementStatus === 'settled' ? a.settlement.commissionAmount : null,
      };
    })
    .filter((r) => f.status === 'all' || r.status === f.status);

  const zero = new Prisma.Decimal(0);
  const summary: StatSummary = {
    count: rows.length,
    totalStartingPrice: rows.reduce((s, r) => s.plus(r.startingPrice), zero),
    totalFinalPrice: rows.reduce((s, r) => s.plus(r.finalPrice ?? 0), zero),
    totalCommission: rows.reduce((s, r) => s.plus(r.commission ?? 0), zero),
  };
  return { rows, summary };
}

export const MAX_CHART_DAYS = 366;

export interface DayBucket {
  date: string;
  upcoming: number;
  active: number;
  ended: number;
  cancelled: number;
  total: number;
  saleValue: Prisma.Decimal;
}

/**
 * stf-003: per local day of the range (every day, zeros included), auction counts by status and the
 * final sale value of the auctions that started that day. Built from the same rows as the list,
 * so the counts add up to the list total.
 */
export function dailyBuckets(f: StatFilter, rows: StatRow[]): DayBucket[] {
  const days: DayBucket[] = [];
  const index = new Map<string, DayBucket>();
  for (let t = Date.parse(`${f.from}T00:00:00Z`); t <= Date.parse(`${f.to}T00:00:00Z`); t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    const bucket = { date, upcoming: 0, active: 0, ended: 0, cancelled: 0, total: 0, saleValue: new Prisma.Decimal(0) };
    days.push(bucket);
    index.set(date, bucket);
  }
  for (const r of rows) {
    const bucket = index.get(localDay(r.startTime, f.tz));
    if (!bucket) continue;
    bucket[r.status] += 1;
    bucket.total += 1;
    if (r.finalPrice) bucket.saleValue = bucket.saleValue.plus(r.finalPrice);
  }
  return days;
}
