import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { PASSWORD, app, createAuction, loginAs, registerUser, resetDb } from './helpers';

const idOf = async (username: string) => (await prisma.user.findUniqueOrThrow({ where: { username } })).id;

describe('adm-004 delete a user', () => {
  let admin: request.Agent;

  beforeAll(async () => {
    await resetDb();
    admin = await loginAs('admin');
  });

  it('soft-deletes a user with no open auctions or bids; they cannot log in and leave the default list', async () => {
    await registerUser('goner');
    const session = await loginAs('goner');
    const id = await idOf('goner');
    const res = await admin.delete(`/api/admin/users/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User goner deleted');

    const login = await request(app).post('/api/auth/login').send({ identifier: 'goner', password: PASSWORD });
    expect(login.status).toBe(401);
    expect(login.body.error).toBe('Invalid username/email or password');
    expect((await session.get('/api/auth/me')).status).toBe(401);

    const list = await admin.get('/api/admin/users?q=goner');
    expect(list.body.total).toBe(0);
    const deleted = await admin.get('/api/admin/users?q=goner&status=deleted');
    expect(deleted.body.users[0].status).toBe('deleted');
    // history stays: the row still exists
    expect((await prisma.user.findUnique({ where: { id } }))?.status).toBe('deleted');
    expect((await admin.delete(`/api/admin/users/${id}`)).status).toBe(404);
  });

  it('refuses to delete a seller with an open auction', async () => {
    await createAuction(await loginAs('alice'));
    const res = await admin.delete(`/api/admin/users/${await idOf('alice')}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Cannot delete alice: they have 1 open auction');
  });

  it('refuses to delete a bidder holding the leading bid on an open auction', async () => {
    const auction = await prisma.auction.findFirstOrThrow({ where: { seller: { username: 'alice' } } });
    const bid = await (await loginAs('bob')).post(`/api/auctions/${auction.id}/bids`).send({ amount: 100 });
    expect(bid.status).toBe(201);
    const res = await admin.delete(`/api/admin/users/${await idOf('bob')}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/1 leading bid on open auctions/);
  });

  it('an admin cannot delete their own account', async () => {
    const res = await admin.delete(`/api/admin/users/${await idOf('admin')}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You cannot delete your own account');
  });

  it('only admins can delete', async () => {
    expect((await (await loginAs('staff')).delete(`/api/admin/users/${await idOf('carol')}`)).status).toBe(403);
  });
});
