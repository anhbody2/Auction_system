import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { getOutbox } from '../src/lib/mailer';
import { app, resetDb } from './helpers';

const PASSWORD = 'Password123!';
async function register(username: string) {
  const res = await request(app).post('/api/auth/register').send({
    fullName: 'Ann Activate',
    username,
    email: `${username}@example.com`,
    phone: '0900000000',
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });
  expect(res.status).toBe(201);
}
const lastToken = (username: string) => getOutbox(`${username}@example.com`).at(-1)!.text.match(/token=([a-f0-9]+)/)![1];
/** Moves the account's tokens back in time, past the resend interval. */
const age = (username: string) =>
  prisma.emailVerificationToken.updateMany({ where: { user: { username } }, data: { createdAt: new Date(Date.now() - 2 * 60_000) } });

describe('mail-002 activation link', () => {
  beforeEach(resetDb);

  it('a valid link activates the account, sets email_verified_at and signs the user in', async () => {
    await register('ann');
    const res = await request(app).post('/api/auth/verify-email').send({ token: lastToken('ann') });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Your account is activated');
    expect(res.body.user).toMatchObject({ username: 'ann', status: 'active', emailVerified: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'ann' } });
    expect(user.status).toBe('active');
    expect(user.emailVerifiedAt).not.toBeNull();

    // The response carries the auth cookie: the same client is signed in.
    const cookie = ([] as string[]).concat(res.headers['set-cookie'])[0];
    expect(cookie).toMatch(/^auction_token=/);
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie.split(';')[0]);
    expect(me.body.user.username).toBe('ann');
  });

  it('a reused or expired link is 400', async () => {
    await register('ann');
    const token = lastToken('ann');
    expect((await request(app).post('/api/auth/verify-email').send({ token })).status).toBe(200);
    const reuse = await request(app).post('/api/auth/verify-email').send({ token });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error).toBe('This activation link is invalid or has expired');

    await register('bea');
    await prisma.emailVerificationToken.updateMany({ where: { user: { username: 'bea' } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).post('/api/auth/verify-email').send({ token: lastToken('bea') })).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { username: 'bea' } })).status).toBe('pending');
  });

  it('resend (by old link or as the signed-in pending user) sends a new link and the old one stops working', async () => {
    await register('ann');
    const first = lastToken('ann');
    await age('ann');
    const byToken = await request(app).post('/api/auth/resend-activation').send({ token: first });
    expect(byToken.status).toBe(200);
    expect(byToken.body.message).toBe('A new activation email has been sent to ann@example.com');
    const second = lastToken('ann');
    expect(second).not.toBe(first);
    expect((await request(app).post('/api/auth/verify-email').send({ token: first })).status).toBe(400);

    await age('ann');
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ identifier: 'ann', password: PASSWORD })).status).toBe(200);
    expect((await agent.post('/api/auth/resend-activation').send({})).status).toBe(200);
    const third = lastToken('ann');
    expect((await request(app).post('/api/auth/verify-email').send({ token: second })).status).toBe(400);
    expect((await request(app).post('/api/auth/verify-email').send({ token: third })).status).toBe(200);
  });

  it('resend for an active account is 400; resend is limited to once a minute; nobody identified is 400', async () => {
    await register('ann');
    const token = lastToken('ann');
    // Right after register: rate-limited
    const tooSoon = await request(app).post('/api/auth/resend-activation').send({ token });
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.error).toBe('Please wait a minute before asking for another activation email');
    await age('ann');
    expect((await request(app).post('/api/auth/resend-activation').send({ token })).status).toBe(200);
    expect((await request(app).post('/api/auth/resend-activation').send({ token })).status).toBe(429);

    await request(app).post('/api/auth/verify-email').send({ token: lastToken('ann') });
    await age('ann');
    const active = await request(app).post('/api/auth/resend-activation').send({ token });
    expect(active.status).toBe(400);
    expect(active.body.error).toBe('Account is already activated');
    expect((await request(app).post('/api/auth/resend-activation').send({})).status).toBe(400);
    expect((await request(app).post('/api/auth/resend-activation').send({ token: 'nope' })).status).toBe(400);
  });
});
