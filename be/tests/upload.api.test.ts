import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HARD_CAP_BYTES, MAX_IMAGE_BYTES, isStoredUpload } from '../src/lib/images';
import { prisma } from '../src/db';
import { app, createAuction, loginAs, resetDb } from './helpers';
import { noiseImage, solidPng } from './upload.fixtures';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'auction-uploads-'));
  process.env.UPLOAD_DIR = dir;
});
afterAll(async () => {
  delete process.env.UPLOAD_DIR;
  await rm(dir, { recursive: true, force: true });
});

/** supertest buffers binary bodies only with a parser. */
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('upl-001 POST /api/uploads', () => {
  beforeEach(resetDb);

  it('stores a small PNG as is and serves it back as image/png', async () => {
    const alice = await loginAs('alice');
    const png = await solidPng(64, 48);
    const res = await alice.post('/api/uploads').attach('image', png, { filename: '../../evil name.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ bytes: png.length, width: 64, height: 48, resized: false });
    expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f]{32}\.png$/);
    // The client's filename is never used on disk.
    expect(await readdir(dir)).toEqual([path.basename(res.body.url)]);
    expect(await isStoredUpload(res.body.url)).toBe(true);

    const served = await request(app).get(res.body.url).buffer(true).parse(binary);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toMatch(/^image\/png/);
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect((served.body as Buffer).equals(png)).toBe(true);
  });

  it('resizes an image over 5 MB so the stored file is at most 5 MB', async () => {
    const alice = await loginAs('alice');
    const big = await noiseImage(2600, 1600, 'png');
    const res = await alice.post('/api/uploads').attach('image', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.resized).toBe(true);
    expect(res.body.originalBytes).toBe(big.length);
    const file = await stat(path.join(dir, path.basename(res.body.url)));
    expect(file.size).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
    expect(file.size).toBe(res.body.bytes);
  }, 60_000);

  it('rejects a text file, even one named .png', async () => {
    const alice = await loginAs('alice');
    const before = await readdir(dir);
    for (const filename of ['notes.txt', 'fake.png']) {
      const res = await alice.post('/api/uploads').attach('image', Buffer.from('just some text'), { filename, contentType: 'text/plain' });
      expect(res.status).toBe(400);
      expect(res.body.fields.image).toBe('Only JPEG, PNG and WebP images are accepted');
    }
    expect(await readdir(dir)).toEqual(before);
  });

  it('rejects a file over the 20 MB hard cap, and a request with no file', async () => {
    const alice = await loginAs('alice');
    const huge = await alice.post('/api/uploads').attach('image', Buffer.alloc(HARD_CAP_BYTES + 1), { filename: 'huge.jpg' });
    expect(huge.status).toBe(413);
    expect(huge.body.error).toBe('Image must be 20 MB or smaller');

    const none = await alice.post('/api/uploads').field('note', 'nothing attached');
    expect(none.status).toBe(400);
    expect(none.body.fields.image).toBe('Choose an image to upload');
  });

  it('requires sign-in', async () => {
    const before = await readdir(dir);
    const res = await request(app).post('/api/uploads').attach('image', await solidPng(10, 10), { filename: 'a.png' });
    expect(res.status).toBe(401);
    expect(await readdir(dir)).toEqual(before);
  });

  it("an auction shows its goods' uploaded images (sell-003: no image URL on the auction)", async () => {
    const alice = await loginAs('alice');
    const up = await alice.post('/api/uploads').attach('image', await solidPng(40, 30), { filename: 'item.png' });
    const category = await prisma.category.findFirstOrThrow();
    const goods = await alice.post('/api/goods').send({
      name: 'Uploaded item',
      description: 'An item with an uploaded image.',
      categoryId: Number(category.id),
      condition: 'used',
      images: [up.body.url],
    });
    expect(goods.status).toBe(201);
    const auction = await createAuction(alice, { goodsId: goods.body.goods.id, imageUrl: 'https://example.com/cat.png' });
    expect(auction.goods).toMatchObject({ images: [up.body.url] });
  });

  it('404s for unknown files and refuses look-alike URLs', async () => {
    expect((await request(app).get('/uploads/0123456789abcdef0123456789abcdef.png')).status).toBe(404);
    expect(await isStoredUpload('/uploads/0123456789abcdef0123456789abcdef.png')).toBe(false);
    expect(await isStoredUpload('https://example.com/cat.png')).toBe(false);
    expect(await isStoredUpload('/uploads/../package.json')).toBe(false);
  });
});
