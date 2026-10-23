import { useCallback, useEffect } from 'react';
import { api } from '../api';
import { can, useAuth } from '../auth';
import { approvalEvent, countsLoaded, streamResynced, type ApprovalEvent } from './approvalsSlice';
import { openAuthedStream } from './authedStream';
import { useAppDispatch, useAppSelector } from './index';

/** True for a user who reviews at least one approval queue (staff, admin). */
export const reviewsApprovals = (user: Parameters<typeof can>[0]) => can(user, 'goods.manage') || can(user, 'credit.manage');

/**
 * stf-009: one EventSource per signed-in staff/admin session (GET /api/staff/events), feeding the approvals
 * slice. Counts are loaded when it starts and again, with a resync for open lists, after a dropped connection
 * comes back (events sent meanwhile are not replayed). Mounted once, in Layout.
 */
export function useStaffEvents() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const enabled = reviewsApprovals(user);

  const loadCounts = useCallback(() => {
    api<{ goods?: number; credit?: number }>('/staff/pending-counts')
      .then((counts) => dispatch(countsLoaded(counts)))
      .catch(() => undefined);
  }, [dispatch]);

  useEffect(() => {
    if (!enabled || user == null || typeof EventSource === 'undefined') return;
    loadCounts();
    let dropped = false;
    return openAuthedStream('/api/staff/events', (source) => {
      for (const [type, kind] of [
        ['goods-request', 'goods'],
        ['credit-request', 'credit'],
      ] as const) {
        source.addEventListener(type, (e) => {
          const message = e as MessageEvent<string>;
          const data = JSON.parse(message.data) as Omit<ApprovalEvent, 'kind' | 'eventId'>;
          dispatch(approvalEvent({ ...data, kind, eventId: message.lastEventId, amount: Number((data as { amount?: unknown }).amount ?? 0) } as ApprovalEvent));
        });
      }
      source.onerror = () => {
        dropped = true;
      };
      source.onopen = () => {
        if (!dropped) return;
        dropped = false;
        loadCounts();
        dispatch(streamResynced());
      };
    });
  }, [enabled, user?.id, dispatch, loadCounts]);
}

/** The latest approval event of one kind (null until one arrives) and the resync counter. */
export function useApprovalEvents<K extends ApprovalEvent['kind']>(kind: K) {
  const { lastEvent, resync } = useAppSelector((s) => s.approvals);
  return { event: lastEvent?.kind === kind ? (lastEvent as Extract<ApprovalEvent, { kind: K }>) : null, resync };
}

/** 'Approved by staff2 just now' etc., for a decision made by someone else. */
export function decidedText(ev: ApprovalEvent) {
  const by = ev.reviewedBy ? ` by ${ev.reviewedBy}` : '';
  const what =
    ev.action === 'approved' ? 'Approved' : ev.action === 'rejected' ? 'Rejected' : ev.action === 'cancelled' ? 'Cancelled' : ev.action === 'deleted' ? 'Deleted' : 'Updated';
  return `${what}${by} just now`;
}

export const isDecision = (ev: ApprovalEvent) => ev.action === 'approved' || ev.action === 'rejected' || ev.action === 'deleted' || ev.action === 'cancelled';
