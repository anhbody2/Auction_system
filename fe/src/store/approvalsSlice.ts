import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { sessionEnded } from './session';

/** stf-009: one event from GET /api/staff/events. */
export type GoodsRequestEvent = {
  kind: 'goods';
  eventId: string;
  id: number;
  action: 'created' | 'resubmitted' | 'approved' | 'rejected' | 'deleted';
  status: string;
  name: string;
  seller: string;
  reviewedBy: string | null;
  pendingCount: number;
};
export type CreditRequestEvent = {
  kind: 'credit';
  eventId: string;
  id: number;
  action: 'created' | 'approved' | 'rejected' | 'cancelled';
  status: string;
  type: 'topup' | 'withdraw';
  amount: number;
  customer: string;
  reviewedBy: string | null;
  pendingCount: number;
};
export type ApprovalEvent = GoodsRequestEvent | CreditRequestEvent;

export interface ApprovalsState {
  /** null until loaded (or without the permission). */
  goodsPending: number | null;
  creditPending: number | null;
  lastEvent: ApprovalEvent | null;
  /** Ids of events already applied (newest last, capped), so a repeated delivery changes nothing. */
  seen: string[];
  /** Bumped after a dropped stream reconnects: open lists reload once (events sent meanwhile are lost). */
  resync: number;
}

export const initialApprovalsState: ApprovalsState = { goodsPending: null, creditPending: null, lastEvent: null, seen: [], resync: 0 };
const SEEN_LIMIT = 200;

/**
 * stf-009 (SRS Staff - request Approve, realtime): live pending counts for the nav badges and the latest
 * approval event, which the staff Goods and Credit pages react to.
 */
const approvalsSlice = createSlice({
  name: 'approvals',
  initialState: initialApprovalsState,
  reducers: {
    countsLoaded(state, action: PayloadAction<{ goods?: number; credit?: number }>) {
      state.goodsPending = action.payload.goods ?? null;
      state.creditPending = action.payload.credit ?? null;
    },
    approvalEvent(state, action: PayloadAction<ApprovalEvent>) {
      const ev = action.payload;
      if (state.seen.includes(ev.eventId)) return;
      state.seen.push(ev.eventId);
      if (state.seen.length > SEEN_LIMIT) state.seen.splice(0, state.seen.length - SEEN_LIMIT);
      if (ev.kind === 'goods') state.goodsPending = ev.pendingCount;
      else state.creditPending = ev.pendingCount;
      state.lastEvent = ev;
    },
    streamResynced(state) {
      state.resync += 1;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(sessionEnded, () => initialApprovalsState);
  },
});

export const { countsLoaded, approvalEvent, streamResynced } = approvalsSlice.actions;
export const approvalsReducer = approvalsSlice.reducer;
