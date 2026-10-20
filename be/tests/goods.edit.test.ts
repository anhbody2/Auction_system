import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { loginAs, resetDb } from './helpers';
import { addGoods, attachAuction } from './goods.fixtures';
import { uploadTestImage, useTempUploadDir } from './upload.fixtures';

useTempUploadDir();

describe('gds-002 PATCH /api/goods/:id', () => {
  beforeEach(resetDb);

  it('the owner edits available goods: fields change and sent images replace the old ones', async () => {
    const alice = await loginAs('alice');
    const id = await addGoods(alice, 'Old name');
    const other = await prisma.category.findFirstOrThrow({ orderBy: { id: 'desc' } });
    const img1 = await uploadTestImage(alice, 30, 30);
    const img2 = await uploadTestImage(alice, 60, 30);

    const res = await alice.patch(`/api/goods/${id}`).send({
      name: 'New name',
      description: 'A new description for the item.',
      categoryId: Number(other.id),
      condition: 'for_parts',
      images: [img1, img2],
    });
    expect(res.status).toBe(200);
    expect(res.body.goods).toMatchObject({
      name: 'New name',
      condition: 'for_parts',
      category: { id: Number(other.id) },
      images: [img1, img2],
      status: 'available',
      lockedReason: null,
    });
    expect(await prisma.goodsImage.count({ where: { goodsId: id } })).toBe(2);

    // A partial edit keeps the rest.
    const partial = await alice.patch(`/api/goods/${id}`).send({ name: 'Newer name' });
    expect(partial.status).toBe(200);
    expect(partial.body.goods).toMatchObject({ name: 'Newer name', images: [img1, img2], condition: 'for_parts' });
  });

  it('validates like create: empty images, linked images and unknown fields are 400', async () => {
    const alice = await loginAs('alice');
    const id = await addGoods(alice, 'Lamp');
    expect((await alice.patch(`/api/goods/${id}`).send({ images: [] })).body.fields.images).toBe('Add at least one image');
    expect((await alice.patch(`/api/goods/${id}`).send({ images: ['https://example.com/a.png'] })).body.fields.images).toBe(
      'Upload the images instead of linking to them',
    );
    expect((await alice.patch(`/api/goods/${id}`).send({ name: 'x' })).body.fields.name).toBe('Name must be at least 3 characters');
    expect((await alice.patch(`/api/goods/${id}`).send({ sellerId: 1 })).status).toBe(400);
    expect((await prisma.goods.findUniqueOrThrow({ where: { id } })).name).toBe('Lamp');
  });

  it('goods in an upcoming or active auction are 409 and unchanged', async () => {
    const alice = await loginAs('alice');
    for (const status of ['active', 'upcoming']) {
      const id = await addGoods(alice, `Busy ${status}`);
      await attachAuction(id, status);
      const res = await alice.patch(`/api/goods/${id}`).send({ name: 'Changed name' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Goods in an active auction cannot be changed');
      expect((await prisma.goods.findUniqueOrThrow({ where: { id } })).name).toBe(`Busy ${status}`);
    }
  });

  it('sold goods are 409 "Sold goods cannot be changed"', async () => {
    const alice = await loginAs('alice');
    const id = await addGoods(alice, 'Sold lamp');
    await attachAuction(id, 'ended', 'bob');
    const res = await alice.patch(`/api/goods/${id}`).send({ name: 'Changed name' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Sold goods cannot be changed');
    const detail = await alice.get(`/api/goods/${id}`);
    expect(detail.body.goods).toMatchObject({ status: 'sold', lockedReason: 'Sold goods cannot be changed' });
  });

  it('goods whose only auction was cancelled, or ended without a winner, can be edited', async () => {
    const alice = await loginAs('alice');
    for (const status of ['cancelled', 'ended']) {
      const id = await addGoods(alice, `Back ${status}`);
      await attachAuction(id, status);
      expect((await alice.patch(`/api/goods/${id}`).send({ name: `Edited ${status}` })).status).toBe(200);
    }
  });

  it('a non-owner gets 404 and nothing changes; unknown ids are 404', async () => {
    const alice = await loginAs('alice');
    const bob = await loginAs('bob');
    const id = await addGoods(alice, 'Alice lamp');
    expect((await bob.patch(`/api/goods/${id}`).send({ name: 'Bob took it' })).status).toBe(404);
    expect((await bob.get(`/api/goods/${id}`)).status).toBe(404);
    expect((await alice.patch('/api/goods/999999').send({ name: 'Nobody' })).status).toBe(404);
    expect((await alice.patch('/api/goods/abc').send({ name: 'Nobody' })).status).toBe(404);
    expect((await prisma.goods.findUniqueOrThrow({ where: { id } })).name).toBe('Alice lamp');
  });
});
