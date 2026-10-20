import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { app, loginAs, resetDb } from './helpers';
import { uploadTestImage, useTempUploadDir } from './upload.fixtures';

useTempUploadDir();

async function body(agent: request.Agent, overrides: Record<string, unknown> = {}) {
  const category = await prisma.category.findFirstOrThrow({ orderBy: { id: 'asc' } });
  return {
    name: 'Brass telescope',
    description: 'A 1920s brass telescope with its original case.',
    categoryId: Number(category.id),
    condition: 'used',
    images: [await uploadTestImage(agent)],
    ...overrides,
  };
}

describe('gds-001 POST /api/goods', () => {
  beforeEach(resetDb);

  it('creates goods with uploaded images in order and returns it as available', async () => {
    const alice = await loginAs('alice');
    const second = await uploadTestImage(alice, 50, 50);
    const data = await body(alice);
    data.images.push(second);
    const res = await alice.post('/api/goods').send(data);
    expect(res.status).toBe(201);
    expect(res.body.goods).toMatchObject({
      name: 'Brass telescope',
      condition: 'used',
      status: 'available',
      images: data.images,
      auctionId: null,
    });
    const row = await prisma.goods.findUniqueOrThrow({ where: { id: BigInt(res.body.goods.id) }, include: { seller: true } });
    expect(row.seller.username).toBe('alice');
  });

  it('missing name, missing category and an empty image list are 400 with field errors', async () => {
    const alice = await loginAs('alice');
    const res = await alice.post('/api/goods').send(await body(alice, { name: '', categoryId: '', images: [] }));
    expect(res.status).toBe(400);
    expect(res.body.fields).toMatchObject({
      name: 'Name must be at least 3 characters',
      categoryId: 'Choose a category',
      images: 'Add at least one image',
    });
    const noImages = await alice.post('/api/goods').send({ ...(await body(alice)), images: undefined });
    expect(noImages.body.fields.images).toBe('Add at least one image');
    expect(await prisma.goods.count()).toBe(0);
  });

  it('an image URL that is not one of this server uploads is 400', async () => {
    const alice = await loginAs('alice');
    for (const url of ['https://example.com/cat.png', '/uploads/0123456789abcdef0123456789abcdef.png']) {
      const res = await alice.post('/api/goods').send(await body(alice, { images: [url] }));
      expect(res.status).toBe(400);
      expect(res.body.fields.images).toBe('Upload the images instead of linking to them');
    }
    expect(await prisma.goods.count()).toBe(0);
  });

  it('an unknown category is 400 and signing in is required', async () => {
    const alice = await loginAs('alice');
    const res = await alice.post('/api/goods').send(await body(alice, { categoryId: 999999 }));
    expect(res.status).toBe(400);
    expect(res.body.fields.categoryId).toBe('Choose a category');
    expect((await request(app).post('/api/goods').send({})).status).toBe(401);
  });
});
