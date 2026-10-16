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

/** Returns a supertest agent that keeps the auth cookie. */
export async function loginAs(identifier: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ identifier, password });
  if (res.status !== 200) throw new Error(`login failed for ${identifier}: ${res.status}`);
  return agent;
}
