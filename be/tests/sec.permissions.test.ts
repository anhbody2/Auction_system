import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { errorHandler } from '../src/lib/http';
import { requirePermission, signToken } from '../src/middleware/auth';
import { app, loginAs, registerUser, resetDb } from './helpers';

// The staff report endpoints land in stf-001/002; here a probe app guards stand-in routes with the real middleware.
const probe = express();
probe.use(cookieParser());
probe.get('/report', requirePermission('report.view'), (_req, res) => res.json({ ok: true }));
probe.get('/export', requirePermission('report.export'), (_req, res) => res.json({ ok: true }));
probe.use(errorHandler);

async function cookieFor(username: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { username } });
  return `auction_token=${signToken(user)}`;
}

const setGrant = (agent: request.Agent, role: string, code: string, granted: boolean) =>
  agent.put(`/api/admin/roles/${role}/permissions/${code}`).send({ granted });

describe('sec-002 role-based permissions', () => {
  beforeAll(resetDb);

  it('requirePermission allows a role holding the permission and rejects others', async () => {
    expect((await request(probe).get('/report').set('Cookie', await cookieFor('staff'))).status).toBe(200);
    const denied = await request(probe).get('/report').set('Cookie', await cookieFor('alice'));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/permission/);
    expect((await request(probe).get('/report')).status).toBe(401);
  });

  it('reads the role from the DB per request, not from the token', async () => {
    await registerUser('promoted');
    const cookie = await cookieFor('promoted'); // token says customer
    expect((await request(probe).get('/report').set('Cookie', cookie)).status).toBe(403);
    await prisma.user.update({ where: { username: 'promoted' }, data: { role: 'staff' } });
    expect((await request(probe).get('/report').set('Cookie', cookie)).status).toBe(200);
  });

  it('admin endpoints: 401 anonymous, 403 for customer and staff, 200 for admin', async () => {
    expect((await request(app).get('/api/admin/permissions')).status).toBe(401);
    expect((await (await loginAs('alice')).get('/api/admin/permissions')).status).toBe(403);
    expect((await (await loginAs('staff')).get('/api/admin/permissions')).status).toBe(403);
    const res = await (await loginAs('admin')).get('/api/admin/permissions');
    expect(res.status).toBe(200);
    expect(res.body.roles).toEqual(['customer', 'staff', 'admin']);
    expect(res.body.grants.staff).toEqual(expect.arrayContaining(['report.view', 'report.export']));
    expect(res.body.grants.customer).toEqual([]);
  });

  it('revoking report.export from staff blocks export immediately; granting restores it', async () => {
    const admin = await loginAs('admin');
    const staffCookie = await cookieFor('staff');
    expect((await setGrant(admin, 'staff', 'report.export', false)).status).toBe(200);
    expect((await request(probe).get('/export').set('Cookie', staffCookie)).status).toBe(403);
    expect((await request(probe).get('/report').set('Cookie', staffCookie)).status).toBe(200);
    expect((await setGrant(admin, 'staff', 'report.export', true)).status).toBe(200);
    expect((await request(probe).get('/export').set('Cookie', staffCookie)).status).toBe(200);
  });

  it('the staff user sees their permissions in /api/auth/me', async () => {
    const me = await (await loginAs('staff')).get('/api/auth/me');
    expect(me.body.user.permissions).toEqual(['auction.manage', 'goods.manage', 'report.export', 'report.view']);
  });

  it('admin cannot remove user.manage or permission.manage from the admin role', async () => {
    const admin = await loginAs('admin');
    for (const code of ['user.manage', 'permission.manage']) {
      const res = await setGrant(admin, 'admin', code, false);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/locked out/);
    }
    expect((await admin.get('/api/admin/permissions')).status).toBe(200);
  });

  it('rejects unknown roles and permissions', async () => {
    const admin = await loginAs('admin');
    expect((await setGrant(admin, 'root', 'report.view', true)).status).toBe(400);
    expect((await setGrant(admin, 'staff', 'nope', true)).status).toBe(400);
    expect((await admin.put('/api/admin/roles/staff/permissions/report.view').send({})).status).toBe(400);
  });

  it('a non-admin cannot change grants', async () => {
    expect((await setGrant(await loginAs('staff'), 'staff', 'user.manage', true)).status).toBe(403);
  });
});
