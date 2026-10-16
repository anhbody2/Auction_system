import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, app, resetDb } from './helpers';

describe('cust-001 login', () => {
  beforeAll(resetDb);

  it('logs in with username and sets a session cookie', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ identifier: 'alice', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('alice');
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie'][0]).toMatch(/auction_token=.+HttpOnly/);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('alice@example.com');
  });

  it('logs in with email (case-insensitive)', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'Bob@Example.com', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('bob');
  });

  it('rejects a wrong password without creating a session', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ identifier: 'alice', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid username/email or password');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('rejects unknown users with the same message', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'nobody', password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid username/email or password');
  });

  it('validates required fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: '', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.fields.identifier).toBeDefined();
    expect(res.body.fields.password).toBeDefined();
  });

  it('logout clears the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ identifier: 'alice', password: PASSWORD });
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});
