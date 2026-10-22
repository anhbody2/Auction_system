import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { hashToken } from '../src/lib/tokens';
import { PASSWORD, app, loginTokens as login, refreshWith, registerUser, resetDb, setCookie } from './helpers';

const rowOf = (token: string) => prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });

describe('sec-003 refresh tokens', () => {
  beforeAll(async () => {
    await resetDb();
    await registerUser('rita');
  });

  afterEach(() => {
    delete process.env.ACCESS_TOKEN_TTL_MS;
    delete process.env.REFRESH_REUSE_GRACE_MS;
  });

  it('login sets a short access cookie and an httpOnly refresh cookie on /api/auth; only the hash is stored', async () => {
    const { access, refresh, res } = await login('alice');
    const accessLine = setCookie(res, 'auction_token')!.line;
    const refreshLine = setCookie(res, 'auction_refresh')!.line;
    expect(accessLine).toMatch(/HttpOnly/);
    expect(accessLine).toMatch(/Max-Age=900/);
    expect(refreshLine).toMatch(/HttpOnly/);
    expect(refreshLine).toMatch(/Path=\/api\/auth/);
    expect(refreshLine).toMatch(/Max-Age=604800/);
    const payload = jwt.decode(access) as jwt.JwtPayload;
    expect(payload.exp! - payload.iat!).toBe(900);

    const row = await rowOf(refresh);
    expect(row.tokenHash).not.toBe(refresh);
    expect(row.revokedAt).toBeNull();
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeGreaterThan(7 * 24 * 3600_000 - 5000);
  });

  it('refresh rotates: new pair, old token revoked as rotated and linked to the new one', async () => {
    const { refresh } = await login('alice');
    const res = await refreshWith(refresh);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('alice');
    const next = setCookie(res, 'auction_refresh')!.value;
    expect(next).not.toBe(refresh);
    expect(setCookie(res, 'auction_token')!.value).toBeTruthy();

    const old = await rowOf(refresh);
    const fresh = await rowOf(next);
    expect(old.revokeReason).toBe('rotated');
    expect(old.replacedById).toBe(fresh.id);
    expect(fresh.expiresAt.getTime()).toBe(old.expiresAt.getTime());

    const me = await request(app).get('/api/auth/me').set('Cookie', `auction_token=${setCookie(res, 'auction_token')!.value}`);
    expect(me.status).toBe(200);
  });

  it('an expired access token is refused, and a refresh gives a working one', async () => {
    process.env.ACCESS_TOKEN_TTL_MS = '1000';
    const { access, refresh } = await login('alice');
    await new Promise((r) => setTimeout(r, 1100));
    expect((await request(app).get('/api/auth/me').set('Cookie', `auction_token=${access}`)).status).toBe(401);
    delete process.env.ACCESS_TOKEN_TTL_MS;
    const res = await refreshWith(refresh);
    expect(res.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Cookie', `auction_token=${setCookie(res, 'auction_token')!.value}`);
    expect(me.status).toBe(200);
  });

  it('reusing a rotated token after the grace window revokes every open session of the user', async () => {
    process.env.REFRESH_REUSE_GRACE_MS = '0';
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'rita' } });
    const a = await login('rita');
    const b = await login('rita');
    const rotated = setCookie(await refreshWith(a.refresh), 'auction_refresh')!.value;
    await new Promise((r) => setTimeout(r, 5));

    const reuse = await refreshWith(a.refresh);
    expect(reuse.status).toBe(401);
    expect(setCookie(reuse, 'auction_refresh')!.value).toBe('');
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect((await rowOf(rotated)).revokeReason).toBe('reuse');
    expect((await refreshWith(rotated)).status).toBe(401);
    expect((await refreshWith(b.refresh)).status).toBe(401);
  });

  it('two refreshes with the same token inside the grace window both succeed (two tabs)', async () => {
    const { refresh } = await login('alice');
    const [first, second] = await Promise.all([refreshWith(refresh), refreshWith(refresh)]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const one = setCookie(first, 'auction_refresh')!.value;
    const two = setCookie(second, 'auction_refresh')!.value;
    expect(one).not.toBe(two);
    expect((await rowOf(one)).revokedAt).toBeNull();
    expect((await rowOf(two)).revokedAt).toBeNull();
  });

  it('missing and unknown tokens 401 and clear both cookies', async () => {
    const none = await request(app).post('/api/auth/refresh');
    expect(none.status).toBe(401);
    expect(none.body.error).toBe('Session expired, please log in again');
    expect(setCookie(none, 'auction_token')!.value).toBe('');
    expect(setCookie(none, 'auction_refresh')!.line).toMatch(/Path=\/api\/auth/);
    expect((await refreshWith('not-a-token')).status).toBe(401);
  });

  it('an expired refresh token is refused', async () => {
    const { refresh } = await login('alice');
    await prisma.refreshToken.update({ where: { tokenHash: hashToken(refresh) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refreshWith(refresh)).status).toBe(401);
  });

  it('a token unused for longer than the 30 minute idle limit is refused and revoked as idle', async () => {
    const { refresh } = await login('alice');
    await prisma.refreshToken.update({ where: { tokenHash: hashToken(refresh) }, data: { lastUsedAt: new Date(Date.now() - 31 * 60_000) } });
    expect((await refreshWith(refresh)).status).toBe(401);
    expect((await rowOf(refresh)).revokeReason).toBe('idle');

    const recent = await login('alice');
    await prisma.refreshToken.update({ where: { tokenHash: hashToken(recent.refresh) }, data: { lastUsedAt: new Date(Date.now() - 29 * 60_000) } });
    expect((await refreshWith(recent.refresh)).status).toBe(200);
  });

  it('a revoked (logged out) token is refused without touching other sessions', async () => {
    const a = await login('rita');
    const b = await login('rita');
    await request(app).post('/api/auth/logout').set('Cookie', `auction_refresh=${a.refresh}`);
    expect((await refreshWith(a.refresh)).status).toBe(401);
    expect((await refreshWith(b.refresh)).status).toBe(200);
  });

  it('locked and deleted users cannot refresh', async () => {
    await registerUser('lockme');
    const { refresh } = await login('lockme');
    // Status changed straight in the DB (not through admin routes, which also revoke): the check is on refresh itself.
    await prisma.user.update({ where: { username: 'lockme' }, data: { status: 'locked' } });
    expect((await refreshWith(refresh)).status).toBe(401);
    await prisma.user.update({ where: { username: 'lockme' }, data: { status: 'deleted' } });
    expect((await refreshWith(refresh)).status).toBe(401);
  });

  it('activation sign-in (mail-002) starts a full session', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ fullName: 'Act Ive', username: 'activ', email: 'activ@example.com', phone: '0900000000', password: PASSWORD, confirmPassword: PASSWORD });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'activ' } });
    const token = 'known-activation-token';
    await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
    const verified = await request(app).post('/api/auth/verify-email').send({ token });
    expect(verified.status).toBe(200);
    const refresh = setCookie(verified, 'auction_refresh')!.value;
    expect((await refreshWith(refresh)).status).toBe(200);
  });
});
