import { describe, expect, it } from 'vitest';
import { creditReviewedToast, goodsReviewedToast } from './requestToasts';

describe('stf-010 toasts for the requester', () => {
  it('goods approved / rejected, with the reason when there is one', () => {
    expect(goodsReviewedToast({ id: 1, name: 'Lamp', status: 'approved', reason: null })).toEqual({ text: 'Your goods "Lamp" were approved', kind: 'success' });
    expect(goodsReviewedToast({ id: 1, name: 'Lamp', status: 'rejected', reason: 'Blurry photo' })).toEqual({ text: 'Your goods "Lamp" were rejected: Blurry photo', kind: 'error' });
    expect(goodsReviewedToast({ id: 1, name: 'Lamp', status: 'rejected', reason: null }).text).toBe('Your goods "Lamp" were rejected');
  });

  it('top-up and withdrawal decisions', () => {
    const base = { id: 3, balance: 0, held: 0 };
    expect(creditReviewedToast({ ...base, status: 'posted', type: 'topup', amount: '1500' })).toEqual({ text: 'Your top-up of $1,500.00 was approved', kind: 'success' });
    expect(creditReviewedToast({ ...base, status: 'rejected', type: 'withdraw', amount: 20, reason: 'Bank details missing' })).toEqual({
      text: 'Your withdrawal of $20.00 was rejected: Bank details missing',
      kind: 'error',
    });
  });

  it('no toast for other ledger changes (staff edits, deletes, adjustments)', () => {
    const base = { id: 3, balance: 0, held: 0 };
    expect(creditReviewedToast({ ...base, status: 'deleted', type: 'topup', amount: 5 })).toBeNull();
    expect(creditReviewedToast({ ...base, status: 'pending', type: 'topup', amount: 5 })).toBeNull();
    expect(creditReviewedToast({ ...base, status: 'posted' })).toBeNull();
    expect(creditReviewedToast({ ...base, status: 'posted', type: 'adjustment', amount: 5 })).toBeNull();
  });
});
