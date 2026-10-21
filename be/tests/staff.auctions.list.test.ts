import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, createAuction, inMinutes, loginAs, resetDb } from './helpers';

const BASE = '/api/staff/manage/auctions';
const names = (body: { auctions: { name: string }[] }) => body.auctions.map((a) => a.name).sort();
const DAY = 24 * 3600 * 1000;
const isoDay = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

describe('stf-006 GET /api/staff/manage/auctions', () => {
  beforeEach(resetDb);

  async function seed() {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const admin = await loginAs('admin');
    const lamp = await createAuction(alice, { name: 'Brass Lamp' });
    await createAuction(alice, { name: 'Brass Bell', startTime: inMinutes(3 * 24 * 60) });
    await createAuction(bob, { name: 'Silk Scarf' });
    const ended = await createAuction(bob, { name: 'Old Clock' });
    await prisma.auction.update({ where: { id: BigInt(ended.id) }, data: { startTime: new Date(Date.now() - 2 * DAY), endTime: new Date(Date.now() - DAY) } });
    const cancelled = await createAuction(bob, { name: 'Gone Vase', startTime: inMinutes(60) });
    await bob.post(`/api/auctions/${cancelled.id}/cancel`);
    void admin;
    const deleted = await createAuction(alice, { name: 'Deleted Mirror', startTime: inMinutes(60) });
    await prisma.auction.update({ where: { id: BigInt(deleted.id) }, data: { deletedAt: new Date() } });
    return { staff: await loginAs('staff'), lamp };
  }

  it('searches by name, seller, status and start-date range, each alone and combined', async () => {
    const { staff } = await seed();
    const q = async (qs: string) => names((await staff.get(`${BASE}?${qs}`)).body);
    expect(await q('')).toEqual(['Brass Bell', 'Brass Lamp', 'Gone Vase', 'Old Clock', 'Silk Scarf']);
    expect(await q('q=brass')).toEqual(['Brass Bell', 'Brass Lamp']);
    expect(await q('seller=bob')).toEqual(['Gone Vase', 'Old Clock', 'Silk Scarf']);
    expect(await q('status=upcoming')).toEqual(['Brass Bell']);
    expect(await q('status=active')).toEqual(['Brass Lamp', 'Silk Scarf']);
    expect(await q('status=ended')).toEqual(['Old Clock']);
    expect(await q('status=cancelled')).toEqual(['Gone Vase']);
    expect(await q(`from=${isoDay(2)}&to=${isoDay(4)}`)).toEqual(['Brass Bell']);
    expect(await q(`to=${isoDay(-1)}`)).toEqual(['Old Clock']);
    // Combined (AND)
    expect(await q('q=brass&status=active')).toEqual(['Brass Lamp']);
    expect(await q(`seller=alice&from=${isoDay(0)}&to=${isoDay(0)}`)).toEqual(['Brass Lamp']);
    expect(await q('q=brass&seller=bob')).toEqual([]);
    expect((await staff.get(`${BASE}?from=${isoDay(2)}&to=${isoDay(1)}`)).status).toBe(400);
  });

  it('deleted auctions only appear with the Deleted filter', async () => {
    const { staff } = await seed();
    expect(names((await staff.get(`${BASE}?status=deleted`)).body)).toEqual(['Deleted Mirror']);
    expect((await staff.get(`${BASE}?status=deleted`)).body.auctions[0].deletedAt).toBeTruthy();
  });

  it('pages with totals', async () => {
    const { staff } = await seed();
    const p1 = (await staff.get(`${BASE}?pageSize=2`)).body;
    const p3 = (await staff.get(`${BASE}?pageSize=2&page=3`)).body;
    expect(p1).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(p1.auctions).toHaveLength(2);
    expect(p3.auctions).toHaveLength(1);
  });

  it('needs auction.manage: 401 anonymous, 403 customer on every route', async () => {
    const alice = await loginAs('alice');
    expect((await request(app).get(BASE)).status).toBe(401);
    const routes = [
      ['get', BASE],
      ['get', `${BASE}/1`],
      ['get', `${BASE}/seller-goods?seller=alice`],
      ['post', BASE],
      ['patch', `${BASE}/1`],
      ['delete', `${BASE}/1`],
    ] as const;
    for (const [method, path] of routes) expect((await alice[method](path)).status, `${method} ${path}`).toBe(403);
    expect((await (await loginAs('admin')).get(BASE)).status).toBe(200);
  });

  it('auction.manage does not let staff use the seller/admin cancel route (sell-005 stays)', async () => {
    const { staff, lamp } = await seed();
    expect((await staff.post(`/api/auctions/${lamp.id}/cancel`)).status).toBe(403);
  });
});
