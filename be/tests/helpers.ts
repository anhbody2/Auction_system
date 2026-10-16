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
      email_verification_tokens, user_info, users RESTART IDENTITY CASCADE`);
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
