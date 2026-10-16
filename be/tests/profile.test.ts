import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, loginAs, resetDb } from './helpers';

describe('cust-002 manage profile', () => {
  beforeAll(resetDb);

  it('requires login', async () => {
    expect((await request(app).get('/api/me/profile')).status).toBe(401);
  });

  it('shows current details and persists edits', async () => {
    const agent = await loginAs('carol');
    const before = await agent.get('/api/me/profile');
    expect(before.body.user).toMatchObject({ fullName: 'Carol Customer', email: 'carol@example.com' });

    const save = await agent
      .put('/api/me/profile')
      .send({ fullName: 'Carol Updated', email: 'carol@example.com', phone: '0912345678', address: '9 River Rd' });
    expect(save.status).toBe(200);

    const after = await agent.get('/api/me/profile');
    expect(after.body.user).toMatchObject({ fullName: 'Carol Updated', phone: '0912345678', address: '9 River Rd', emailVerified: true });
  });

  it('rejects a malformed email and an email owned by someone else', async () => {
    const agent = await loginAs('carol');
    const bad = await agent.put('/api/me/profile').send({ fullName: 'Carol', email: 'nope', phone: '0912345678' });
    expect(bad.status).toBe(400);
    expect(bad.body.fields.email).toBe('Enter a valid email address');

    const dup = await agent.put('/api/me/profile').send({ fullName: 'Carol', email: 'alice@example.com', phone: '0912345678' });
    expect(dup.status).toBe(409);
    expect(dup.body.fields.email).toBe('Email is already registered');
  });
});
