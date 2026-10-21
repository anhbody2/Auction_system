import type request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { createAuction, loginAs, resetDb } from './helpers';
import { addGoods } from './goods.fixtures';
import { uploadTestImage, useTempUploadDir } from './upload.fixtures';

useTempUploadDir();

describe('stf-005 staff add, view, edit, delete goods', () => {
  beforeEach(resetDb);

  async function body(staff: request.Agent, overrides: Record<string, unknown> = {}) {
    const category = await prisma.category.findFirstOrThrow({ orderBy: { id: 'asc' } });
    return {
      seller: 'alice',
      name: 'Staff Lamp',
      description: 'Added by staff for alice.',
      categoryId: Number(category.id),
      condition: 'new',
      images: [await uploadTestImage(staff)],
      ...overrides,
    };
  }

  it('adds goods for a seller: approved (active) at once, and the seller can auction them', async () => {
    const staff = await loginAs('staff');
    const res = await staff.post('/api/staff/goods').send(await body(staff));
    expect(res.status).toBe(201);
    expect(res.body.goods).toMatchObject({ name: 'Staff Lamp', status: 'active', seller: { username: 'alice' }, reviewedBy: { username: 'staff' } });
    const alice = await loginAs('alice');
    expect((await alice.get('/api/me/goods?status=available')).body.goods.map((g: { name: string }) => g.name)).toEqual(['Staff Lamp']);
    await createAuction(alice, { goodsId: res.body.goods.id });

    const noSeller = await staff.post('/api/staff/goods').send(await body(staff, { seller: 'nobody' }));
    expect(noSeller.status).toBe(400);
    expect(noSeller.body.fields.seller).toBe('No customer with that username or email');
    expect((await staff.post('/api/staff/goods').send(await body(staff, { seller: 'staff' }))).status).toBe(400);
    const bad = await staff.post('/api/staff/goods').send(await body(staff, { name: 'x', images: [] }));
    expect(bad.status).toBe(400);
    expect(bad.body.fields).toMatchObject({ name: 'Name must be at least 3 characters', images: 'Add at least one image' });
  });

  it('views goods with images, seller, buyer and auctions', async () => {
    const alice = await loginAs('alice');
    const id = await addGoods(alice, 'Viewed Lamp');
    const a = await createAuction(alice, { goodsId: Number(id) });
    const staff = await loginAs('staff');
    const res = await staff.get(`/api/staff/goods/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.goods).toMatchObject({ name: 'Viewed Lamp', seller: { username: 'alice' }, buyer: null, inOpenAuction: true });
    expect(res.body.goods.images[0]).toMatch(/^\/uploads\//);
    expect(res.body.goods.auctions[0]).toMatchObject({ id: a.id, status: 'active' });
    expect((await staff.get('/api/staff/goods/999999')).status).toBe(404);
  });

  it('edits with validation; goods in an open auction cannot be edited', async () => {
    const alice = await loginAs('alice');
    const id = await addGoods(alice, 'Edit Lamp');
    const staff = await loginAs('staff');
    const ok = await staff.patch(`/api/staff/goods/${id}`).send({ name: 'Edited Lamp', condition: 'used' });
    expect(ok.status).toBe(200);
    expect(ok.body.goods).toMatchObject({ name: 'Edited Lamp', condition: 'used', status: 'active' });
    expect((await staff.patch(`/api/staff/goods/${id}`).send({ name: 'x' })).status).toBe(400);
    expect((await staff.patch(`/api/staff/goods/${id}`).send({ images: ['https://example.com/a.png'] })).status).toBe(400);
    expect((await staff.patch(`/api/staff/goods/${id}`).send({ sellerId: 1 })).status).toBe(400);

    await createAuction(alice, { goodsId: Number(id) });
    expect((await staff.patch(`/api/staff/goods/${id}`).send({ name: 'Busy Lamp' })).status).toBe(409);
    expect((await prisma.goods.findUniqueOrThrow({ where: { id } })).name).toBe('Edited Lamp');
  });

  it('delete is soft (status deleted, row kept); blocked with 400 while in an upcoming or active auction', async () => {
    const alice = await loginAs('alice');
    const free = await addGoods(alice, 'Free Lamp');
    const busy = await addGoods(alice, 'Busy Lamp');
    const later = await addGoods(alice, 'Later Lamp');
    await createAuction(alice, { goodsId: Number(busy) });
    await createAuction(alice, { goodsId: Number(later), startTime: new Date(Date.now() + 3600_000).toISOString() });
    const staff = await loginAs('staff');

    expect((await staff.delete(`/api/staff/goods/${free}`)).status).toBe(200);
    expect((await prisma.goods.findUniqueOrThrow({ where: { id: free } })).status).toBe('deleted');
    expect((await alice.get('/api/me/goods')).body.goods.map((g: { name: string }) => g.name)).not.toContain('Free Lamp');
    expect((await staff.get(`/api/staff/goods/${free}`)).body.goods.status).toBe('deleted');
    expect((await staff.delete(`/api/staff/goods/${free}`)).status).toBe(404);

    for (const id of [busy, later]) {
      const blocked = await staff.delete(`/api/staff/goods/${id}`);
      expect(blocked.status).toBe(400);
      expect(blocked.body.error).toBe('Goods in an upcoming or active auction cannot be deleted');
      expect((await prisma.goods.findUniqueOrThrow({ where: { id } })).status).toBe('active');
    }
  });
});
