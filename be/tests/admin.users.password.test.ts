import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { PASSWORD, app, loginAs, registerUser, resetDb } from './helpers';

const idOf = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;
const loginStatus = async (identifier: string, password: string) =>
  (await request(app).post('/api/auth/login').send({ identifier, password })).status;

describe('adm-005 admin changes a user password', () => {
  let admin: request.Agent;

  beforeAll(async () => {
    await resetDb();
    admin = await loginAs('admin');
    await registerUser('forgetful');
  });

  it('sets a new password without the old one; old stops working, new works', async () => {
    const res = await admin
      .put(`/api/admin/users/${await idOf('forgetful')}/password`)
      .send({ newPassword: 'Brand9New', confirmPassword: 'Brand9New' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password updated for forgetful');
    expect(await loginStatus('forgetful', PASSWORD)).toBe(401);
    expect(await loginStatus('forgetful', 'Brand9New')).toBe(200);
  });

  it('applies the registration password rules', async () => {
    const id = await idOf('forgetful');
    const weak = await admin.put(`/api/admin/users/${id}/password`).send({ newPassword: 'abc', confirmPassword: 'abc' });
    expect(weak.status).toBe(400);
    expect(weak.body.fields.newPassword).toBe('Password must be at least 8 characters');
    const noDigit = await admin.put(`/api/admin/users/${id}/password`).send({ newPassword: 'abcdefgh', confirmPassword: 'abcdefgh' });
    expect(noDigit.body.fields.newPassword).toBe('Password must contain a number');
    const mismatch = await admin.put(`/api/admin/users/${id}/password`).send({ newPassword: 'Brand9New', confirmPassword: 'Other9New' });
    expect(mismatch.body.fields.confirmPassword).toBe('Passwords do not match');
    expect(await loginStatus('forgetful', 'Brand9New')).toBe(200);
  });

  it('invalidates outstanding password reset links', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: 'forgetful@example.com' });
    const id = await idOf('forgetful');
    expect(await prisma.passwordResetToken.count({ where: { userId: id, usedAt: null } })).toBe(1);
    await admin.put(`/api/admin/users/${id}/password`).send({ newPassword: 'Third3Pass', confirmPassword: 'Third3Pass' });
    expect(await prisma.passwordResetToken.count({ where: { userId: id, usedAt: null } })).toBe(0);
  });

  it('unknown user 404; non-admin 403', async () => {
    expect((await admin.put('/api/admin/users/999999/password').send({ newPassword: 'Brand9New', confirmPassword: 'Brand9New' })).status).toBe(404);
    const staff = await loginAs('staff');
    const res = await staff.put(`/api/admin/users/${await idOf('alice')}/password`).send({ newPassword: 'Brand9New', confirmPassword: 'Brand9New' });
    expect(res.status).toBe(403);
  });
});
