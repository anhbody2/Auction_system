import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { errorHandler } from '../src/lib/http';
import { requirePermission } from '../src/middleware/auth';
import { PASSWORD, app, loginAs, registerUser, resetDb } from './helpers';

// Stand-in staff endpoint guarded by the real middleware (real report routes land in stf-001).
const probe = express();
probe.use(cookieParser());
probe.get('/report', requirePermission('report.view'), (_req, res) => res.json({ ok: true }));
probe.use(errorHandler);

const idOf = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;

describe('adm-003 edit a user, including role and status', () => {
  let admin: request.Agent;

  beforeAll(async () => {
    await resetDb();
    admin = await loginAs('admin');
  });

  it('updates email, profile fields and role', async () => {
    const res = await admin
      .patch(`/api/admin/users/${await idOf('carol')}`)
      .send({ email: 'Carol.New@example.com', fullName: 'Carol Renamed', phone: '0911222333', address: '1 Main St' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'carol.new@example.com',
      fullName: 'Carol Renamed',
      phone: '0911222333',
      address: '1 Main St',
      role: 'customer',
    });
  });

  it('rejects invalid values with 400 and a taken email with 409', async () => {
    const id = await idOf('carol');
    const bad = await admin.patch(`/api/admin/users/${id}`).send({ email: 'nope', role: 'root', status: 'deleted' });
    expect(bad.status).toBe(400);
    expect(bad.body.fields).toMatchObject({
      email: 'Enter a valid email address',
      role: 'Role must be customer, staff or admin',
      status: 'Status must be active or locked',
    });
    expect((await admin.patch(`/api/admin/users/${id}`).send({ passwordHash: 'x' })).status).toBe(400);
    const taken = await admin.patch(`/api/admin/users/${id}`).send({ email: 'bob@example.com' });
    expect(taken.status).toBe(409);
    expect((await admin.patch('/api/admin/users/999999').send({ role: 'staff' })).status).toBe(404);
  });

  it('a customer changed to staff gets staff access on the next request', async () => {
    await registerUser('soonstaff');
    const user = await loginAs('soonstaff');
    const cookie = await sessionCookie('soonstaff');
    expect((await request(probe).get('/report').set('Cookie', cookie)).status).toBe(403);

    const res = await admin.patch(`/api/admin/users/${await idOf('soonstaff')}`).send({ role: 'staff' });
    expect(res.body.user.role).toBe('staff');

    expect((await request(probe).get('/report').set('Cookie', cookie)).status).toBe(200);
    const me = await user.get('/api/auth/me');
    expect(me.body.user.role).toBe('staff');
    expect(me.body.user.permissions).toContain('report.view');
  });

  it('a locked user cannot log in and loses their session; unlocking restores login', async () => {
    const bobSession = await loginAs('bob');
    const id = await idOf('bob');
    expect((await admin.patch(`/api/admin/users/${id}`).send({ status: 'locked' })).body.user.status).toBe('locked');

    const login = await request(app).post('/api/auth/login').send({ identifier: 'bob', password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error).toBe('This account is locked. Contact an administrator.');
    expect((await bobSession.get('/api/auth/me')).status).toBe(401);

    await admin.patch(`/api/admin/users/${id}`).send({ status: 'active' });
    expect((await request(app).post('/api/auth/login').send({ identifier: 'bob', password: PASSWORD })).status).toBe(200);
  });

  it('an admin cannot change their own role or status, but can edit their own profile', async () => {
    const self = await idOf('admin');
    const role = await admin.patch(`/api/admin/users/${self}`).send({ role: 'customer' });
    expect(role.status).toBe(400);
    expect(role.body.error).toBe('You cannot change your own role or status');
    expect((await admin.patch(`/api/admin/users/${self}`).send({ status: 'locked' })).status).toBe(400);
    expect((await admin.patch(`/api/admin/users/${self}`).send({ fullName: 'Ada Admin II', role: 'admin' })).status).toBe(200);
  });
});

async function sessionCookie(username: string) {
  const res = await request(app).post('/api/auth/login').send({ identifier: username, password: PASSWORD });
  return (res.headers['set-cookie'][0] as string).split(';')[0];
}
