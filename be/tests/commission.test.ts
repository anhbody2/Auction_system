import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { commissionFor } from '../src/lib/commission';
import { settleAuction } from '../src/lib/settlement';
import { createAuction, loginAs, resetDb } from './helpers';

describe('sys-003 tiered system commission', () => {
  it.each([
    [50, 5],
    [99.99, 10],
    [100, 5],
    [999.99, 50],
    [1000, 20],
    [9999.99, 200],
    [10000, 100],
    [25000, 250],
  ])('commission on %d is %d', (price, expected) => {
    expect(commissionFor(price).toNumber()).toBe(expected);
  });

  describe('settlement', () => {
    beforeEach(resetDb);

    const sell = async (price: number) => {
      const alice = await loginAs('alice');
      const bob = await loginAs('bob');
      const a = await createAuction(alice, { initialPrice: price });
      expect((await bob.post(`/api/auctions/${a.id}/bids`).send({ amount: price })).status).toBe(201);
      await prisma.auction.update({ where: { id: BigInt(a.id) }, data: { endTime: new Date(Date.now() - 1000) } });
      expect(await settleAuction(BigInt(a.id))).toBe(true);
      const settlement = await prisma.auctionSettlement.findUniqueOrThrow({ where: { auctionId: BigInt(a.id) } });
      const payout = await prisma.creditTransaction.findFirstOrThrow({ where: { auctionId: BigInt(a.id), transactionType: 'payout' } });
      const seller = await prisma.user.findUniqueOrThrow({ where: { username: 'alice' } });
      return { settlement, payout, sellerBalance: seller.creditBalance.toNumber() };
    };

    it('credits the seller the price minus 10% below $100 and stores the commission', async () => {
      const { settlement, payout, sellerBalance } = await sell(80);
      expect(settlement.commissionAmount.toNumber()).toBe(8);
      expect(payout.amount.toNumber()).toBe(72);
      expect(payout.description).toBe('Sold: Vintage camera (commission $8.00, 10%)');
      expect(sellerBalance).toBe(1072);
    });

    it('credits the seller the price minus 5% at $150', async () => {
      const { settlement, payout, sellerBalance } = await sell(150);
      expect(settlement.commissionAmount.toNumber()).toBe(7.5);
      expect(payout.amount.toNumber()).toBe(142.5);
      expect(payout.description).toBe('Sold: Vintage camera (commission $7.50, 5%)');
      expect(sellerBalance).toBe(1142.5);
    });
  });
});
