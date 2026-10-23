import { money } from './api';

/** stf-010: 'goods-reviewed' on the seller's own stream. */
export interface GoodsReviewedEvent {
  id: number;
  name: string;
  status: 'approved' | 'rejected';
  reason: string | null;
}

/** stf-007/stf-010: 'credit-request' on the customer's own stream (also sent for staff edits and deletes). */
export interface CreditRequestUserEvent {
  id: number;
  status: string;
  type?: string;
  amount?: number | string;
  reason?: string | null;
  balance: number;
  held: number;
}

export function goodsReviewedToast(ev: GoodsReviewedEvent): { text: string; kind: 'success' | 'error' } {
  if (ev.status === 'approved') return { text: `Your goods "${ev.name}" were approved`, kind: 'success' };
  return { text: `Your goods "${ev.name}" were rejected${ev.reason ? `: ${ev.reason}` : ''}`, kind: 'error' };
}

/** Only an approval or rejection of a top-up or withdrawal is worth a toast; other ledger changes are not. */
export function creditReviewedToast(ev: CreditRequestUserEvent): { text: string; kind: 'success' | 'error' } | null {
  const what = ev.type === 'topup' ? 'top-up' : ev.type === 'withdraw' ? 'withdrawal' : null;
  if (!what || ev.amount == null) return null;
  const subject = `Your ${what} of ${money(Number(ev.amount))}`;
  if (ev.status === 'posted') return { text: `${subject} was approved`, kind: 'success' };
  if (ev.status === 'rejected') return { text: `${subject} was rejected${ev.reason ? `: ${ev.reason}` : ''}`, kind: 'error' };
  return null;
}
