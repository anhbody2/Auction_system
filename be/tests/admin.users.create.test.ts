import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app, loginAs, resetDb } from './helpers';

const valid = { username: 'newstaff', email: 'NewStaff@Example.com', password: 'Welcome123', role: 'staff', fullName: 'New Staff' };

describe('adm-002 add a user with a role', () => {
  let admin: request.Agent;

  beforeAll(async () => {
    await resetDb();
    admin = await loginAs('admin');
  });

  it('creates an active, verified user with the chosen role', async () => {
    const res = await admin.post('/api/admin/users').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      username: 'newstaff',
      email: 'newstaff@example.com',
      role: 'staff',
      status: 'active',
      emailVerified: true,
      fullName: 'New Staff',
    });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('the new user can log in right away and has the role', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'newstaff', password: 'Welcome123' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('staff');
    expect(res.body.user.permissions).toContain('report.view');
  });

  it('full name is optional', async () => {
    const res = await admin.post('/api/admin/users').send({ ...valid, username: 'plain', email: 'plain@example.com', fullName: '' });
    expect(res.status).toBe(201);
    expect(res.body.user.fullName).toBeNull();
  });

  it('validates missing fields, weak password and invalid role', async () => {
    const missing = await admin.post('/api/admin/users').send({});
    expect(missing.status).toBe(400);
    expect(Object.keys(missing.body.fields)).toEqual(expect.arrayContaining(['username', 'email', 'password', 'role']));

    const weak = await admin.post('/api/admin/users').send({ ...valid, username: 'weak1', email: 'weak1@example.com', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.fields.password).toMatch(/at least 8/);

    const role = await admin.post('/api/admin/users').send({ ...valid, username: 'root1', email: 'root1@example.com', role: 'root' });
    expect(role.status).toBe(400);
    expect(role.body.fields.role).toBe('Role must be customer, staff or admin');
  });

  it('rejects duplicate username or email with 409', async () => {
    const dupName = await admin.post('/api/admin/users').send({ ...valid, email: 'other@example.com' });
    expect(dupName.status).toBe(409);
    expect(dupName.body.fields.username).toBe('Username is already taken');

    const dupEmail = await admin.post('/api/admin/users').send({ ...valid, username: 'other', email: 'alice@example.com' });
    expect(dupEmail.status).toBe(409);
    expect(dupEmail.body.fields.email).toBe('Email is already registered');
  });

  it('only admins can create users', async () => {
    const res = await (await loginAs('staff')).post('/api/admin/users').send({ ...valid, username: 'x1', email: 'x1@example.com' });
    expect(res.status).toBe(403);
  });
});
