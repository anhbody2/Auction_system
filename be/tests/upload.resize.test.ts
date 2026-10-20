import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, NOT_AN_IMAGE, fitImage } from '../src/lib/images';
import { noiseImage, solidPng } from './upload.fixtures';

describe('upl-001 fitImage keeps stored images at or under 5 MB', () => {
  it('returns an image under 5 MB unchanged', async () => {
    const small = await solidPng(200, 100);
    const out = await fitImage(small);
    expect(out.resized).toBe(false);
    expect(out.buffer.equals(small)).toBe(true);
    expect(out).toMatchObject({ format: 'png', width: 200, height: 100 });
  });

  it('shrinks a PNG over 5 MB to at most 5 MB, keeping its format and aspect ratio', async () => {
    const big = await noiseImage(2600, 1600, 'png');
    expect(big.length).toBeGreaterThan(MAX_IMAGE_BYTES);
    const out = await fitImage(big);
    expect(out.resized).toBe(true);
    expect(out.buffer.length).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width! / meta.height!).toBeCloseTo(2600 / 1600, 2);
    expect(meta.width).toBeLessThan(2600);
  }, 60_000);

  it('recompresses a JPEG over 5 MB to at most 5 MB, keeping its aspect ratio', async () => {
    const big = await noiseImage(4000, 3000, 'jpeg');
    expect(big.length).toBeGreaterThan(MAX_IMAGE_BYTES);
    const out = await fitImage(big);
    expect(out.resized).toBe(true);
    expect(out.buffer.length).toBeLessThanOrEqual(MAX_IMAGE_BYTES);
    expect(out.format).toBe('jpeg');
    expect(out.width / out.height).toBeCloseTo(4 / 3, 2);
  }, 60_000);

  it('works to any limit, stepping the long edge down', async () => {
    const img = await noiseImage(1000, 500, 'png');
    const out = await fitImage(img, 200 * 1024);
    expect(out.buffer.length).toBeLessThanOrEqual(200 * 1024);
    expect(out.width / out.height).toBeCloseTo(2, 2);
  }, 60_000);

  it('rejects bytes that are not a JPEG, PNG or WebP, whatever the file is called', async () => {
    await expect(fitImage(Buffer.from('plain text, not an image'))).rejects.toMatchObject({ status: 400, message: NOT_AN_IMAGE });
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } }).gif().toBuffer();
    await expect(fitImage(gif)).rejects.toMatchObject({ status: 400, message: NOT_AN_IMAGE });
  });
});
