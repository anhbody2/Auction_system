import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { lockBalances } from './credit';
import { publishUserEvent } from './events';
import { HttpError } from './http';
import { sendMail } from './mailer';

/**
 * stf-007: top-ups and withdrawals are requests. They are stored as ledger rows with status 'pending'
 * (balance_before = balance_after = the credit at request time) and only move money when staff approve.
 * Approval updates that same row to 'posted' with the real before/after; rejection sets 'rejected' + reason.
 */
export type RequestType = 'topup' | 'withdraw';
export const REQUEST_TYPES: RequestType[] = ['topup', 'withdraw'];
export const NOT_PENDING_MESSAGE = 'Only pending requests can be approved or rejected';
export const AT_APPROVAL_MESSAGE = 'The customer does not have enough available credit for this withdrawal';
const LABEL: Record<RequestType, string> = { topup: 'Top up', withdraw: 'Withdrawal' };

export async function requestCredit(userId: bigint, type: RequestType, amount: Prisma.Decimal.Value) {
  return prisma.$transaction(async (tx) => {
    const { balance, available } = await lockBalances(tx, userId);
    const value = new Prisma.Decimal(amount);
    // Checked now so the customer hears at once; checked again at approval time.
    if (type === 'withdraw' && available.lessThan(value)) {
      throw new HttpError(400, 'Insufficient available credit', { amount: 'Amount exceeds your available credit' });
    }
    return tx.creditTransaction.create({
      data: { userId, transactionType: type, amount: value, balanceBefore: balance, balanceAfter: balance, status: 'pending', description: `${LABEL[type]} request` },
    });
  });
}

/** Locks one ledger row for the rest of the transaction. */
export async function lockTransaction(tx: Prisma.TransactionClient, id: bigint) {
  await tx.$queryRaw`SELECT id FROM credit_transactions WHERE id = ${id} FOR UPDATE`;
  const row = await tx.creditTransaction.findUnique({ where: { id }, include: { user: { select: { id: true, username: true, email: true } } } });
  if (!row) throw new HttpError(404, 'Transaction not found');
  return row;
}

/**
 * Approves or rejects a pending request exactly once (the row lock serialises concurrent reviews).
 * A withdrawal larger than the customer's available credit at approval time is refused and stays pending.
 */
export async function reviewCredit(id: bigint, staffId: bigint, decision: 'approve' | 'reject', reason = '') {
  if (decision === 'reject' && !reason.trim()) throw new HttpError(400, 'Validation failed', { reason: 'Give a reason for the rejection' });
  const row = await prisma.$transaction(async (tx) => {
    const current = await lockTransaction(tx, id);
    if (current.status !== 'pending' || !REQUEST_TYPES.includes(current.transactionType as RequestType)) throw new HttpError(400, NOT_PENDING_MESSAGE);
    const type = current.transactionType as RequestType;
    const reviewed = { reviewedAt: new Date(), reviewedById: staffId };
    if (decision === 'reject') {
      return tx.creditTransaction.update({ where: { id }, data: { status: 'rejected', rejectionReason: reason.trim(), ...reviewed }, include: { user: true } });
    }
    const { balance, held, available } = await lockBalances(tx, current.userId);
    if (type === 'withdraw' && available.lessThan(current.amount)) throw new HttpError(400, AT_APPROVAL_MESSAGE);
    const after = type === 'topup' ? balance.plus(current.amount) : balance.minus(current.amount);
    await tx.user.update({ where: { id: current.userId }, data: { creditBalance: after, heldBalance: held } });
    return tx.creditTransaction.update({
      where: { id },
      data: { status: 'posted', balanceBefore: balance, balanceAfter: after, description: LABEL[type], ...reviewed },
      include: { user: true },
    });
  });

  // After commit: the customer's credit and request list refresh live; the mail is best effort.
  const u = row.user;
  publishUserEvent(u.id, {
    type: 'credit-request',
    id: `${row.id}-${row.status}`,
    data: { id: row.id, status: row.status, type: row.transactionType, amount: row.amount, balance: u.creditBalance, held: u.heldBalance },
  });
  const what = `${LABEL[row.transactionType as RequestType].toLowerCase()} request of $${row.amount.toFixed(2)}`;
  const text =
    row.status === 'posted'
      ? `Hi ${u.username},\n\nYour ${what} was approved. Your credit is now $${u.creditBalance.toFixed(2)}.`
      : `Hi ${u.username},\n\nYour ${what} was rejected.\nReason: ${row.rejectionReason}`;
  await sendMail(u.email, row.status === 'posted' ? 'Your credit request was approved' : 'Your credit request was rejected', text).catch((err) =>
    console.error('credit review mail failed', err),
  );
  return row;
}
