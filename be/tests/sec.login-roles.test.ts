import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { signToken } from '../src/middleware/auth';
import { PASSWORD, app, resetDb } from './helpers';

describe('sec-001 one login page for customer, staff and admin', () => {
  beforeAll(resetDb);

  it('puts the role in the signed token', () => {
    const token = signToken({ id: 7n, username: 'sam', role: 'staff' });
    const payload = jwt.decode(token) as jwt.JwtPayload;
    expect(payload.sub).toBe('7');
    expect(payload.role).toBe('staff');
  });

  it.each([
    ['alice', 'customer'],
    ['staff', 'staff'],
    ['admin', 'admin'],
  ])('%s logs in on the same endpoint and gets role %s', async (identifier, role) => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ identifier, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(role);

    const cookie = res.headers['set-cookie'][0] as string;
    const token = cookie.split(';')[0].split('=')[1];
    expect((jwt.decode(token) as jwt.JwtPayload).role).toBe(role);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe(role);
  });

  it('staff and admin can also log in by email', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'admin@example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });
});
