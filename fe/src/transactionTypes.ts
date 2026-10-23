/** ui-3b.2: labels for credit transaction types, shared by the customer list and the staff table. */
export const TYPE_LABELS: Record<string, string> = {
  topup: 'Top up',
  withdraw: 'Withdraw',
  hold: 'Hold',
  release: 'Release',
  payment: 'Purchase',
  payout: 'Sale',
  adjustment: 'Adjustment',
};

/** Chip order on the Credit page (every type the server knows, be/src/lib/transactions.ts). */
export const TYPE_ORDER = ['topup', 'withdraw', 'hold', 'release', 'payment', 'payout', 'adjustment'];

export const typeLabel = (type: string) => TYPE_LABELS[type] ?? type;
