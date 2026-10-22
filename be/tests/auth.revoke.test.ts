import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { hashToken } from '../src/lib/tokens';
import { PASSWORD, app, loginAs, loginTokens, refreshWith, registerUser, resetDb, setCookie } from './helpers';

const NEW = 'NewPass123';
const userId = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;
const openCount = async (username: string) => prisma.refreshToken.count({ where: { userId: await userId(username), revokedAt: null } });
const reasons = async (username: string) =>
  (await prisma.refreshToken.findMany({ where: { userId: await userId(username) }, select: { revokeReason: true } })).map((r) => r.revokeReason);

describe('sec-003 password and account changes revoke every refresh token', () => {
  let tabs: { refresh: string }[];

  beforeEach(async () => {
    await resetDb();
    await registerUser('victor');
    tabs = [await loginTokens('victor'), await loginTokens('victor')];
    expect(await openCount('victor')).toBe(2);
  });

  it('password reset by link', async () => {
    const token = 'known-reset-token';
    await prisma.passwordResetToken.create({ data: { userId: await userId('victor'), tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
    const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: NEW, confirmPassword: NEW });
    expect(res.status).toBe(200);
    expect(await openCount('victor')).toBe(0);
    expect(await reasons('victor')).toEqual(['password', 'password']);
    for (const tab of tabs) expect((await refreshWith(tab.refresh)).status).toBe(401);
  });

  it('password change while signed in: the other sessions end, this one gets a fresh session', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ identifier: 'victor', password: PASSWORD });
    const own = setCookie(login, 'auction_refresh')!.value;
    const res = await agent.put('/api/me/password').send({ currentPassword: PASSWORD, newPassword: NEW, confirmPassword: NEW });
    expect(res.status).toBe(200);
    const fresh = setCookie(res, 'auction_refresh')!.value;
    expect(fresh).toBeTruthy();
    expect(await openCount('victor')).toBe(1);
    for (const old of [...tabs.map((t) => t.refresh), own]) expect((await refreshWith(old)).status).toBe(401);
    expect((await refreshWith(fresh)).status).toBe(200);
  });

  it('admin sets a password', async () => {
    const admin = await loginAs('admin');
    const res = await admin.put(`/api/admin/users/${await userId('victor')}/password`).send({ newPassword: NEW, confirmPassword: NEW });
    expect(res.status).toBe(200);
    expect(await openCount('victor')).toBe(0);
    expect(new Set(await reasons('victor'))).toEqual(new Set(['password']));
  });

  it('admin locks the user; an unrelated edit revokes nothing', async () => {
    const admin = await loginAs('admin');
    const id = await userId('victor');
    expect((await admin.patch(`/api/admin/users/${id}`).send({ fullName: 'Victor Renamed' })).status).toBe(200);
    expect(await openCount('victor')).toBe(2);
    expect((await admin.patch(`/api/admin/users/${id}`).send({ status: 'locked' })).status).toBe(200);
    expect(await openCount('victor')).toBe(0);
    expect(new Set(await reasons('victor'))).toEqual(new Set(['locked']));
  });

  it('admin soft-deletes the user', async () => {
    const admin = await loginAs('admin');
    expect((await admin.delete(`/api/admin/users/${await userId('victor')}`)).status).toBe(200);
    expect(await openCount('victor')).toBe(0);
    expect(new Set(await reasons('victor'))).toEqual(new Set(['deleted']));
    // Rows stay (revoked, not deleted).
    expect(await prisma.refreshToken.count({ where: { userId: await userId('victor') } })).toBe(2);
  });
});
