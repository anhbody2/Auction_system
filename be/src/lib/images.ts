import { randomBytes } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { config } from '../config';
import { HttpError } from './http';

/** upl-001: stored images are at most 5 MB; uploads above the hard cap are refused before decoding. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const HARD_CAP_BYTES = 20 * 1024 * 1024;

const EXTENSIONS = { jpeg: 'jpg', png: 'png', webp: 'webp' } as const;
type ImageFormat = keyof typeof EXTENSIONS;

export const NOT_AN_IMAGE = 'Only JPEG, PNG and WebP images are accepted';

/** Each step shrinks the long edge to this share of the previous step; below MIN_LONG_EDGE we give up. */
const SCALE_STEP = 0.8;
const MIN_LONG_EDGE = 320;
const QUALITIES = [85, 70, 55];

export interface FittedImage {
  buffer: Buffer;
  format: ImageFormat;
  width: number;
  height: number;
  resized: boolean;
}

function encode(img: Sharp, format: ImageFormat, quality: number) {
  if (format === 'jpeg') return img.jpeg({ quality, mozjpeg: true });
  if (format === 'webp') return img.webp({ quality });
  return img.png({ compressionLevel: 9 }); // lossless: only the size step helps
}

/**
 * Checks the bytes are a JPEG, PNG or WebP (by content, not by name or MIME type). An image at or under
 * `limit` is returned unchanged. A larger one is re-encoded in its own format: first at lower quality,
 * then with the long edge stepped down by SCALE_STEP (aspect ratio kept) until it fits.
 */
export async function fitImage(input: Buffer, limit = MAX_IMAGE_BYTES): Promise<FittedImage> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new HttpError(400, NOT_AN_IMAGE, { image: NOT_AN_IMAGE });
  }
  const format = meta.format as ImageFormat;
  if (!(format in EXTENSIONS) || !meta.width || !meta.height) throw new HttpError(400, NOT_AN_IMAGE, { image: NOT_AN_IMAGE });
  if (input.length <= limit) return { buffer: input, format, width: meta.width, height: meta.height, resized: false };

  // EXIF orientations 5-8 swap width and height once rotate() applies them.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;
  const qualities = format === 'png' ? [100] : QUALITIES;

  for (let scale = 1; Math.max(width, height) * scale >= MIN_LONG_EDGE; scale *= SCALE_STEP) {
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    for (const q of qualities) {
      const img = sharp(input).rotate().resize(w, h, { fit: 'fill' });
      const { data, info } = await encode(img, format, q).toBuffer({ resolveWithObject: true });
      if (data.length <= limit) return { buffer: data, format, width: info.width, height: info.height, resized: true };
    }
  }
  throw new HttpError(400, 'Image could not be reduced below 5 MB', { image: 'Image could not be reduced below 5 MB' });
}

/** Saves a fitted image under a random name (never the client's filename) and returns its public URL. */
export async function storeImage(img: FittedImage) {
  const name = `${randomBytes(16).toString('hex')}.${EXTENSIONS[img.format]}`;
  await mkdir(config.uploadDir, { recursive: true });
  await writeFile(path.join(config.uploadDir, name), img.buffer);
  return `/uploads/${name}`;
}

const UPLOAD_URL = /^\/uploads\/[0-9a-f]{32}\.(jpg|png|webp)$/;

/** True when `url` is an image this server stored (used to refuse arbitrary image URLs). */
export async function isStoredUpload(url: string) {
  if (!UPLOAD_URL.test(url)) return false;
  try {
    await access(path.join(config.uploadDir, path.basename(url)));
    return true;
  } catch {
    return false;
  }
}
