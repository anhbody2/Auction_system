import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, app, loginAs, registerUser, resetDb } from './helpers';

describe('cust-003 change password', () => {
  beforeAll(async () => {
    await resetDb();
    await registerUser('pwuser');
  });

  it('rejects a wrong current password', async () => {
    const agent = await loginAs('pwuser');
    const res = await agent.put('/api/me/password').send({ currentPassword: 'Wrong1234', newPassword: 'NewPass123', confirmPassword: 'NewPass123' });
    expect(res.status).toBe(400);
    expect(res.body.fields.currentPassword).toBe('Current password is incorrect');
  });

  it('validates new password and confirmation', async () => {
    const agent = await loginAs('pwuser');
    const res = await agent.put('/api/me/password').send({ currentPassword: PASSWORD, newPassword: 'short', confirmPassword: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.fields.newPassword).toBeDefined();
    expect(res.body.fields.confirmPassword).toBe('Passwords do not match');
  });

  it('changes the password: old fails, new works', async () => {
    const agent = await loginAs('pwuser');
    const res = await agent.put('/api/me/password').send({ currentPassword: PASSWORD, newPassword: 'NewPass123', confirmPassword: 'NewPass123' });
    expect(res.status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ identifier: 'pwuser', password: PASSWORD })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ identifier: 'pwuser', password: 'NewPass123' })).status).toBe(200);
  });
});
