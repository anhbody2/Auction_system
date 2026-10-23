import { cleanAmount, formatTyping } from './bidMath';

/** ui-3b.1: the Credit page's one request form, switched between top-up and withdrawal. */
export type CreditMode = 'topup' | 'withdraw';

export const QUICK_AMOUNTS = [500, 1000, 5000, 10000];

export const isCreditMode = (v: string | null): v is CreditMode => v === 'topup' || v === 'withdraw';

const dollars = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Amount from the input ('' or junk -> null); separators are allowed while typing. */
export function parseCreditAmount(text: string) {
  const clean = cleanAmount(text);
  if (clean === '' || clean === '.') return null;
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Inline check before sending: an amount is required, and a withdrawal may not exceed available credit.
 * Everything else (format, limits, approval rules) stays with the server, whose 400 message is shown as-is.
 */
export function checkCreditRequest(mode: CreditMode, text: string, available: number): string | null {
  const amount = parseCreditAmount(text);
  if (amount == null) return 'Enter an amount.';
  if (mode === 'withdraw' && amount > available) return `Exceeds available credit of ${dollars(available)}.`;
  return null;
}

export function submitLabel(mode: CreditMode, text: string) {
  const amount = parseCreditAmount(text);
  const what = mode === 'topup' ? 'Request top up' : 'Request withdrawal';
  return amount == null ? what : `${what} ${dollars(amount)}`;
}

/** What the quick amount buttons put in the input. */
export const quickText = (n: number) => formatTyping(String(n));
