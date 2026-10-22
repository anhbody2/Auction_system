import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { hashToken } from '../src/lib/tokens';
import { app, loginTokens as login, refreshWith, resetDb, setCookie } from './helpers';

const rowOf = (token: string) => prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });

describe('sec-003 logout revokes the refresh token', () => {
  beforeAll(resetDb);

  it('revokes the token (reason logout) and clears both cookies', async () => {
    const { access, refresh } = await login('alice');
    const res = await request(app).post('/api/auth/logout').set('Cookie', [`auction_token=${access}`, `auction_refresh=${refresh}`]);
    expect(res.status).toBe(200);
    expect(setCookie(res, 'auction_token')!.value).toBe('');
    expect(setCookie(res, 'auction_refresh')!.value).toBe('');
    expect(setCookie(res, 'auction_refresh')!.line).toMatch(/Path=\/api\/auth/);
    const row = await rowOf(refresh);
    expect(row.revokedAt).not.toBeNull();
    expect(row.revokeReason).toBe('logout');
    expect((await refreshWith(refresh)).status).toBe(401);
  });

  it('works when the access token has already expired', async () => {
    const { refresh } = await login('alice');
    const expired = jwt.sign({ sub: '1', username: 'alice', role: 'customer', exp: Math.floor(Date.now() / 1000) - 60 }, 'test-secret');
    const res = await request(app).post('/api/auth/logout').set('Cookie', [`auction_token=${expired}`, `auction_refresh=${refresh}`]);
    expect(res.status).toBe(200);
    expect((await rowOf(refresh)).revokeReason).toBe('logout');
  });

  it("stores reason 'idle' when sent by the idle logout (sec-005)", async () => {
    const { refresh } = await login('alice');
    const res = await request(app).post('/api/auth/logout').set('Cookie', `auction_refresh=${refresh}`).send({ reason: 'idle' });
    expect(res.status).toBe(200);
    expect((await rowOf(refresh)).revokeReason).toBe('idle');
  });

  it('rejects other reasons, and succeeds without any cookie', async () => {
    expect((await request(app).post('/api/auth/logout').send({ reason: 'whatever' })).status).toBe(400);
    expect((await request(app).post('/api/auth/logout')).status).toBe(200);
  });

  it('does not revoke the other sessions of the user', async () => {
    const a = await login('bob');
    const b = await login('bob');
    await request(app).post('/api/auth/logout').set('Cookie', `auction_refresh=${a.refresh}`);
    expect((await rowOf(b.refresh)).revokedAt).toBeNull();
  });
});
