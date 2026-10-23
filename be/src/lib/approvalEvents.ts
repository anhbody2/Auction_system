import { prisma } from '../db';
import { publishStaffEvent, publishUserEvent } from './events';

/**
 * stf-009 (SRS Staff - request Approve: "Turn all request Approve to realtime"): the two approval queues, goods
 * review (stf-005) and credit requests (stf-007), push every change to staff streams (GET /api/staff/events).
 * Callers publish after their transaction commits, so a refused (400) review publishes nothing. Publishing never
 * fails the request: a problem is logged. See docs/realtime.md.
 */

export type GoodsRequestAction = 'created' | 'resubmitted' | 'approved' | 'rejected' | 'deleted';
export type CreditRequestAction = 'created' | 'approved' | 'rejected' | 'cancelled';

/** Requests still waiting, for the nav badges. */
export const goodsPendingCount = () => prisma.goods.count({ where: { status: 'pending' } });
// Same list as REQUEST_TYPES in creditRequests.ts (not imported: that module publishes through this one).
export const creditPendingCount = () => prisma.creditTransaction.count({ where: { status: 'pending', transactionType: { in: ['topup', 'withdraw'] } } });

let seq = 0;
/** Unique per event, so a client can drop a copy it already applied. */
const eventId = (kind: string, id: bigint | number, action: string) => `${kind}-${id}-${action}-${Date.now()}-${++seq}`;

export async function publishGoodsRequest(
  action: GoodsRequestAction,
  goods: { id: bigint; name: string; status: string; seller: { username: string } },
  reviewedBy?: { username: string } | null,
) {
  try {
    const pendingCount = await goodsPendingCount();
    publishStaffEvent('goods', {
      type: 'goods-request',
      id: eventId('goods', goods.id, action),
      data: { id: goods.id, action, status: goods.status, name: goods.name, seller: goods.seller.username, reviewedBy: reviewedBy?.username ?? null, pendingCount },
    });
  } catch (err) {
    console.error('goods-request event failed', err);
  }
}

export async function publishCreditRequest(
  action: CreditRequestAction,
  row: { id: bigint; status: string; transactionType: string; amount: unknown },
  customer: { username: string },
  reviewedBy?: { username: string } | null,
) {
  try {
    const pendingCount = await creditPendingCount();
    publishStaffEvent('credit', {
      type: 'credit-request',
      id: eventId('credit', row.id, action),
      data: {
        id: row.id,
        action,
        status: row.status,
        type: row.transactionType,
        amount: row.amount,
        customer: customer.username,
        reviewedBy: reviewedBy?.username ?? null,
        pendingCount,
      },
    });
  } catch (err) {
    console.error('credit-request event failed', err);
  }
}

/**
 * stf-010: the requester's side. The seller hears about the decision on their own stream (/api/me/events):
 * My Goods updates the row and a toast says what happened, on whatever page they are.
 */
export function publishGoodsReviewed(goods: { id: bigint; name: string; status: string; rejectionReason: string | null; seller: { id: bigint } }) {
  const status = goods.status === 'active' ? 'approved' : 'rejected';
  publishUserEvent(goods.seller.id, {
    type: 'goods-reviewed',
    id: eventId('goods-reviewed', goods.id, status),
    data: { id: goods.id, name: goods.name, status, reason: status === 'rejected' ? goods.rejectionReason : null },
  });
}
