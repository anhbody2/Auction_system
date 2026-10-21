import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, loginAs, resetDb } from './helpers';
import { addGoods } from './goods.fixtures';
import { useTempUploadDir } from './upload.fixtures';

useTempUploadDir();

type G = { name: string; status: string; seller: { username: string } };
const names = (body: { goods: G[] }) => body.goods.map((g) => g.name).sort();

describe('stf-005 GET /api/staff/goods', () => {
  beforeEach(resetDb);

  async function seed() {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const [art, fashion] = await prisma.category.findMany({ orderBy: { id: 'asc' }, take: 2 });
    await addGoods(alice, 'Brass Lamp', { categoryId: Number(art.id) });
    await addGoods(alice, 'Silk Scarf', { categoryId: Number(fashion.id) });
    await addGoods(bob, 'Brass Bell', { categoryId: Number(fashion.id) }, { approve: false });
    const gone = await addGoods(bob, 'Old Lamp', { categoryId: Number(art.id) });
    await prisma.goods.update({ where: { id: gone }, data: { status: 'deleted' } });
    return { staff: await loginAs('staff'), art, fashion };
  }

  it('lists all non-deleted goods with seller and status; searches by each field and combined', async () => {
    const { staff, art, fashion } = await seed();
    const all = await staff.get('/api/staff/goods');
    expect(all.status).toBe(200);
    expect(names(all.body)).toEqual(['Brass Bell', 'Brass Lamp', 'Silk Scarf']);
    expect(all.body.goods.find((g: G) => g.name === 'Brass Bell')).toMatchObject({ status: 'pending', seller: { username: 'bob' } });

    expect(names((await staff.get('/api/staff/goods?q=brass')).body)).toEqual(['Brass Bell', 'Brass Lamp']);
    expect(names((await staff.get('/api/staff/goods?seller=alice')).body)).toEqual(['Brass Lamp', 'Silk Scarf']);
    expect(names((await staff.get(`/api/staff/goods?categoryId=${fashion.id}`)).body)).toEqual(['Brass Bell', 'Silk Scarf']);
    expect(names((await staff.get('/api/staff/goods?status=pending')).body)).toEqual(['Brass Bell']);
    // Combined (AND)
    expect(names((await staff.get(`/api/staff/goods?q=brass&categoryId=${art.id}`)).body)).toEqual(['Brass Lamp']);
    expect(names((await staff.get('/api/staff/goods?q=brass&seller=bob&status=pending')).body)).toEqual(['Brass Bell']);
    expect(names((await staff.get('/api/staff/goods?q=scarf&seller=bob')).body)).toEqual([]);
  });

  it('soft-deleted goods only show with status=deleted', async () => {
    const { staff } = await seed();
    expect(names((await staff.get('/api/staff/goods?q=old')).body)).toEqual([]);
    expect(names((await staff.get('/api/staff/goods?status=deleted')).body)).toEqual(['Old Lamp']);
  });

  it('pages 20 per page by default with a total, newest first', async () => {
    const aliceId = (await prisma.user.findUniqueOrThrow({ where: { username: 'alice' } })).id;
    for (let i = 0; i < 23; i++) await prisma.goods.create({ data: { sellerId: aliceId, name: `Item ${String(i).padStart(2, '0')}` } });
    const staff = await loginAs('staff');
    const p1 = (await staff.get('/api/staff/goods')).body;
    const p2 = (await staff.get('/api/staff/goods?page=2')).body;
    expect(p1).toMatchObject({ total: 23, page: 1, pageSize: 20 });
    expect(p1.goods).toHaveLength(20);
    expect(p2.goods).toHaveLength(3);
    expect(p1.goods[0].name).toBe('Item 22');
  });

  it('needs goods.manage: 401 anonymous, 403 customer on every route; admin allowed', async () => {
    const alice = await loginAs('alice');
    expect((await request(app).get('/api/staff/goods')).status).toBe(401);
    const routes = [
      ['get', '/api/staff/goods'],
      ['get', '/api/staff/goods/1'],
      ['post', '/api/staff/goods'],
      ['patch', '/api/staff/goods/1'],
      ['delete', '/api/staff/goods/1'],
      ['post', '/api/staff/goods/1/approve'],
      ['post', '/api/staff/goods/1/reject'],
    ] as const;
    for (const [method, path] of routes) {
      expect((await alice[method](path)).status, `${method} ${path}`).toBe(403);
    }
    expect((await (await loginAs('admin')).get('/api/staff/goods')).status).toBe(200);
  });
});
