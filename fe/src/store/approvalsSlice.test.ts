import { describe, expect, it } from 'vitest';
import { approvalEvent, approvalsReducer, countsLoaded, initialApprovalsState, streamResynced, type ApprovalEvent } from './approvalsSlice';
import { sessionEnded } from './session';

const goods = (over: Partial<ApprovalEvent> = {}) =>
  ({ kind: 'goods', eventId: 'g-1', id: 1, action: 'created', status: 'pending', name: 'Lamp', seller: 'alice', reviewedBy: null, pendingCount: 3, ...over }) as ApprovalEvent;
const credit = (over: Partial<ApprovalEvent> = {}) =>
  ({ kind: 'credit', eventId: 'c-1', id: 9, action: 'created', status: 'pending', type: 'topup', amount: 20, customer: 'bob', reviewedBy: null, pendingCount: 2, ...over }) as ApprovalEvent;

describe('stf-009 approvals slice', () => {
  it('loads the counts; a missing permission leaves its count null', () => {
    expect(approvalsReducer(initialApprovalsState, countsLoaded({ goods: 4, credit: 1 }))).toMatchObject({ goodsPending: 4, creditPending: 1 });
    expect(approvalsReducer(initialApprovalsState, countsLoaded({ credit: 1 }))).toMatchObject({ goodsPending: null, creditPending: 1 });
  });

  it('each goods action sets the goods count and lastEvent', () => {
    let s = approvalsReducer(initialApprovalsState, countsLoaded({ goods: 2, credit: 5 }));
    for (const [i, action] of (['created', 'resubmitted', 'approved', 'rejected', 'deleted'] as const).entries()) {
      const ev = goods({ eventId: `g-${i}`, action, pendingCount: 10 + i });
      s = approvalsReducer(s, approvalEvent(ev));
      expect(s.goodsPending).toBe(10 + i);
      expect(s.creditPending).toBe(5);
      expect(s.lastEvent).toEqual(ev);
    }
  });

  it('each credit action sets the credit count and lastEvent', () => {
    let s = approvalsReducer(initialApprovalsState, countsLoaded({ goods: 2, credit: 5 }));
    for (const [i, action] of (['created', 'approved', 'rejected', 'cancelled'] as const).entries()) {
      const ev = credit({ eventId: `c-${i}`, action, pendingCount: i });
      s = approvalsReducer(s, approvalEvent(ev));
      expect(s.creditPending).toBe(i);
      expect(s.goodsPending).toBe(2);
      expect(s.lastEvent).toEqual(ev);
    }
  });

  it('ignores a repeated delivery of the same event (same id and action)', () => {
    const first = approvalsReducer(initialApprovalsState, approvalEvent(goods({ pendingCount: 3 })));
    const later = approvalsReducer(first, approvalEvent(goods({ eventId: 'g-2', action: 'approved', pendingCount: 2 })));
    const repeat = approvalsReducer(later, approvalEvent(goods({ pendingCount: 3 })));
    expect(repeat).toBe(later);
    expect(repeat.goodsPending).toBe(2);
    expect(repeat.lastEvent?.action).toBe('approved');
  });

  it('remembers a bounded number of event ids', () => {
    let s = initialApprovalsState;
    for (let i = 0; i < 250; i++) s = approvalsReducer(s, approvalEvent(credit({ eventId: `c-${i}` })));
    expect(s.seen).toHaveLength(200);
    expect(s.seen[0]).toBe('c-50');
  });

  it('a reconnect bumps resync; the end of the session clears everything', () => {
    const s = approvalsReducer(approvalsReducer(initialApprovalsState, approvalEvent(goods())), streamResynced());
    expect(s.resync).toBe(1);
    expect(approvalsReducer(s, sessionEnded())).toEqual(initialApprovalsState);
  });
});
