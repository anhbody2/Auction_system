/**
 * trx-001: transaction search filters and their client-side checks. The messages match
 * be/src/lib/transactions.ts so the user sees the same text whichever side catches it.
 */
export const SEARCH_WINDOW_DAYS = 30;
export const WINDOW_MESSAGE = `Date must be within the last ${SEARCH_WINDOW_DAYS} days`;
export const MIN_AMOUNT_MESSAGE = 'Minimum amount must be at least $1';
export const MAX_AMOUNT_MESSAGE = 'Maximum amount must be at least the minimum';

export interface TransactionFilterValues {
  from: string;
  to: string;
  name: string;
  id: string;
  min: string;
  max: string;
}

/** Local calendar day (YYYY-MM-DD) of a date. */
export function localDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** First day the search accepts: today minus 30 days. */
export function earliestDay(today: Date) {
  const d = new Date(today);
  d.setDate(d.getDate() - SEARCH_WINDOW_DAYS);
  return localDay(d);
}

export function defaultFilter(today = new Date()): TransactionFilterValues {
  return { from: earliestDay(today), to: localDay(today), name: '', id: '', min: '', max: '' };
}

export type FilterErrors = Partial<Record<keyof TransactionFilterValues, string>>;

export function validateTransactionFilter(v: TransactionFilterValues, today = new Date()): FilterErrors {
  const errors: FilterErrors = {};
  const earliest = earliestDay(today);
  const todayStr = localDay(today);
  if (v.from && v.from < earliest) errors.from = WINDOW_MESSAGE;
  if (v.to && v.to < earliest) errors.to = WINDOW_MESSAGE;
  if (v.to && v.to > todayStr) errors.to = 'To date cannot be in the future';
  if (!errors.from && v.from && v.to && v.from > v.to) errors.from = 'From date must be on or before To date';
  if (v.id.trim() && !/^\d{1,18}$/.test(v.id.trim())) errors.id = 'Transaction id must be a number';
  const min = v.min.trim() === '' ? undefined : Number(v.min);
  const max = v.max.trim() === '' ? undefined : Number(v.max);
  if (min !== undefined && (!Number.isFinite(min) || min < 1)) errors.min = MIN_AMOUNT_MESSAGE;
  if (max !== undefined) {
    if (!Number.isFinite(max) || max < 1) errors.max = 'Maximum amount must be at least $1';
    else if (min !== undefined && Number.isFinite(min) && max < min) errors.max = MAX_AMOUNT_MESSAGE;
  }
  return errors;
}

/** Query string for GET /credit/transactions (and the staff list); blank fields are left out. */
export function filterQuery(v: TransactionFilterValues, extra: Record<string, string | number> = {}) {
  const params = new URLSearchParams({ tz: String(new Date().getTimezoneOffset()) });
  for (const [k, val] of Object.entries({ ...v, ...extra })) {
    const s = String(val).trim();
    if (s) params.set(k, s);
  }
  return params.toString();
}
