import { beforeAll, describe, expect, it } from 'vitest';
import type request from 'supertest';
import { prisma } from '../src/db';
import { loginAs, registerUser, resetDb } from './helpers';

describe('adm-001 list and view users', () => {
  let admin: request.Agent;

  beforeAll(async () => {
    await resetDb();
    admin = await loginAs('admin');
  });

  it('returns a page of users without password hashes', async () => {
    const res = await admin.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5); // alice, bob, carol, staff, admin
    expect(res.body.users.map((u: { username: string }) => u.username)).toEqual(['alice', 'bob', 'carol', 'staff', 'admin']);
    const alice = res.body.users[0];
    expect(alice).toMatchObject({ email: 'alice@example.com', role: 'customer', status: 'active', fullName: 'Alice Seller' });
    expect(alice.createdAt).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
  });

  it('paginates', async () => {
    const res = await admin.get('/api/admin/users?page=2&pageSize=2');
    expect(res.body).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(res.body.users.map((u: { username: string }) => u.username)).toEqual(['carol', 'staff']);
  });

  it('searches username or email, case-insensitive', async () => {
    const byName = await admin.get('/api/admin/users?q=BO');
    expect(byName.body.users.map((u: { username: string }) => u.username)).toEqual(['bob']);
    const byEmail = await admin.get('/api/admin/users?q=carol@example');
    expect(byEmail.body.users.map((u: { username: string }) => u.username)).toEqual(['carol']);
  });

  it('filters by role and status', async () => {
    const staff = await admin.get('/api/admin/users?role=staff');
    expect(staff.body.users.map((u: { username: string }) => u.username)).toEqual(['staff']);

    await registerUser('newbie'); // registers as pending
    const pending = await admin.get('/api/admin/users?status=pending');
    expect(pending.body.users.map((u: { username: string }) => u.username)).toEqual(['newbie']);

    const customersActive = await admin.get('/api/admin/users?role=customer&status=active');
    expect(customersActive.body.total).toBe(3);
  });

  it('rejects an invalid role or status filter', async () => {
    expect((await admin.get('/api/admin/users?role=root')).status).toBe(400);
    expect((await admin.get('/api/admin/users?status=weird')).status).toBe(400);
  });

  it('returns details for one user; unknown id -> 404', async () => {
    const bob = await prisma.user.findUniqueOrThrow({ where: { username: 'bob' } });
    const res = await admin.get(`/api/admin/users/${bob.id}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      username: 'bob',
      email: 'bob@example.com',
      role: 'customer',
      fullName: 'Bob Bidder',
      emailVerified: true,
      creditBalance: 1000,
      auctionCount: 0,
      bidCount: 0,
    });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect((await admin.get('/api/admin/users/999999')).status).toBe(404);
    expect((await admin.get('/api/admin/users/abc')).status).toBe(404);
  });

  it('is admin-only', async () => {
    expect((await (await loginAs('staff')).get('/api/admin/users')).status).toBe(403);
    expect((await (await loginAs('alice')).get('/api/admin/users/1')).status).toBe(403);
  });
});
