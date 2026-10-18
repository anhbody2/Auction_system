import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db';
import { seed } from '../prisma/seed';

export const app = createApp();
export const PASSWORD = 'Password123!';

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE auction_messages, auction_settlements, credit_transactions, bid_tickets, auctions,
      goods_images, goods, categories, bid_increment_rules, password_reset_tokens,
      email_verification_tokens, user_info, users, role_permissions RESTART IDENTITY CASCADE`);
  await seed(prisma);
}

/** Registers a fresh account; the password is PASSWORD unless given. */
export async function registerUser(username: string, password = PASSWORD) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      fullName: `${username} Test`,
      username,
      email: `${username}@example.com`,
      phone: '0900000000',
      password,
      confirmPassword: password,
    });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return res.body.user;
}

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

/** Creates an auction through the API as the given (logged-in) agent. Starts now, ends in 60 min unless overridden. */
export async function createAuction(agent: request.Agent, overrides: Record<string, unknown> = {}) {
  const category = await prisma.category.findFirstOrThrow();
  const res = await agent.post('/api/auctions').send({
    name: 'Vintage camera',
    description: 'A working film camera in good condition.',
    categoryId: Number(category.id),
    condition: 'used',
    initialPrice: 100,
    minIncrement: 10,
    startTime: inMinutes(0),
    endTime: inMinutes(60),
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`create auction failed: ${JSON.stringify(res.body)}`);
  return res.body.auction as { id: number; [k: string]: unknown };
}

export { inMinutes };

/** Returns a supertest agent that keeps the auth cookie. */
export async function loginAs(identifier: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ identifier, password });
  if (res.status !== 200) throw new Error(`login failed for ${identifier}: ${res.status}`);
  return agent;
}

/**
 * Inserts an auction row directly (any dates, any stored status) for reporting tests.
 * With `sold`, also records a won settlement: winner, final price and commission.
 */
export async function insertAuction(opts: {
  seller: string;
  name: string;
  start: string;
  end: string;
  initialPrice?: number;
  status?: string;
  sold?: { winner: string; price: number; commission: number; settledAt?: string };
}) {
  const seller = await prisma.user.findUniqueOrThrow({ where: { username: opts.seller } });
  const goods = await prisma.goods.create({ data: { sellerId: seller.id, name: opts.name } });
  const winner = opts.sold ? await prisma.user.findUniqueOrThrow({ where: { username: opts.sold.winner } }) : null;
  const start = new Date(opts.start);
  const end = new Date(opts.end);
  const auction = await prisma.auction.create({
    data: {
      sellerId: seller.id,
      goodsId: goods.id,
      name: opts.name,
      initialPrice: opts.initialPrice ?? 100,
      currentPrice: opts.sold?.price ?? null,
      durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
      startTime: start,
      endTime: end,
      status: opts.status ?? (opts.sold ? 'ended' : 'upcoming'),
      winnerId: winner?.id ?? null,
      closedAt: opts.sold ? end : null,
    },
  });
  if (opts.sold && winner) {
    const bid = await prisma.bidTicket.create({
      data: { auctionId: auction.id, bidderId: winner.id, amount: opts.sold.price, status: 'won', wonAt: end },
    });
    await prisma.auctionSettlement.create({
      data: {
        auctionId: auction.id,
        winningBidId: bid.id,
        commissionAmount: opts.sold.commission,
        settlementStatus: 'settled',
        settledAt: new Date(opts.sold.settledAt ?? opts.end),
      },
    });
  }
  return auction;
}
