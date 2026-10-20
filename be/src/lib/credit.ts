import { Prisma } from '@prisma/client';
import { HttpError } from './http';

type Tx = Prisma.TransactionClient;
export type CreditType = 'topup' | 'withdraw' | 'hold' | 'release' | 'payment' | 'payout';

interface Movement {
  userId: bigint;
  type: CreditType;
  amount: Prisma.Decimal.Value;
  auctionId?: bigint;
  bidTicketId?: bigint;
  description?: string;
}

/** Locks the user row for the rest of the transaction and returns its balances. */
export async function lockBalances(tx: Tx, userId: bigint) {
  const rows = await tx.$queryRaw<{ credit_balance: Prisma.Decimal; held_balance: Prisma.Decimal }[]>`
    SELECT credit_balance, held_balance FROM users WHERE id = ${userId} FOR UPDATE`;
  if (!rows[0]) throw new HttpError(404, 'User not found');
  const balance = new Prisma.Decimal(rows[0].credit_balance);
  const held = new Prisma.Decimal(rows[0].held_balance);
  return { balance, held, available: balance.minus(held) };
}

/**
 * Applies one credit movement inside a transaction and records it.
 * balance_before/balance_after on the ledger row are the credit balance (crd-002), so hold and release
 * rows show it unchanged: credit only moves on top up, withdraw and auction close.
 *  topup:   credit += amount
 *  withdraw: credit -= amount        (needs available >= amount)
 *  hold:    held   += amount         (needs available >= amount)
 *  release: held   -= amount
 *  payment: held -= amount, credit -= amount (winner pays from held funds)
 *  payout:  credit += amount         (seller receives proceeds)
 */
export async function applyCredit(tx: Tx, m: Movement) {
  const amount = new Prisma.Decimal(m.amount);
  const { balance, held, available } = await lockBalances(tx, m.userId);
  let newBalance = balance;
  let newHeld = held;

  switch (m.type) {
    case 'topup':
    case 'payout':
      newBalance = balance.plus(amount);
      break;
    case 'withdraw':
      if (available.lessThan(amount)) throw new HttpError(400, 'Insufficient available credit', { amount: 'Amount exceeds your available credit' });
      newBalance = balance.minus(amount);
      break;
    case 'hold':
      if (available.lessThan(amount)) throw new HttpError(400, 'Insufficient available credit', { amount: 'Bid exceeds your available credit' });
      newHeld = held.plus(amount);
      break;
    case 'release':
      newHeld = Prisma.Decimal.max(held.minus(amount), 0);
      break;
    case 'payment':
      newHeld = Prisma.Decimal.max(held.minus(amount), 0);
      newBalance = balance.minus(amount);
      break;
  }

  await tx.user.update({ where: { id: m.userId }, data: { creditBalance: newBalance, heldBalance: newHeld } });
  return tx.creditTransaction.create({
    data: {
      userId: m.userId,
      auctionId: m.auctionId,
      bidTicketId: m.bidTicketId,
      transactionType: m.type,
      amount,
      balanceBefore: balance,
      balanceAfter: newBalance,
      description: m.description,
    },
  });
}
