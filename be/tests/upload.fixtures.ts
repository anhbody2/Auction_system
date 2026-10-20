import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type request from 'supertest';
import { afterAll, beforeAll } from 'vitest';

/** Random noise barely compresses, so these sizes give files well over 5 MB. */
export function noiseImage(width: number, height: number, format: 'png' | 'jpeg') {
  const img = sharp({ create: { width, height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } } });
  return (format === 'png' ? img.png({ compressionLevel: 1 }) : img.jpeg({ quality: 100 })).toBuffer();
}

export const solidPng = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#3366cc' } }).png().toBuffer();

/** Points UPLOAD_DIR at a fresh temp folder for this test file. */
export function useTempUploadDir() {
  let dir = '';
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'auction-uploads-'));
    process.env.UPLOAD_DIR = dir;
  });
  afterAll(async () => {
    delete process.env.UPLOAD_DIR;
    await rm(dir, { recursive: true, force: true });
  });
  return () => dir;
}

/** Uploads a small PNG as the agent and returns its /uploads URL. */
export async function uploadTestImage(agent: request.Agent, width = 40, height = 30) {
  const res = await agent.post('/api/uploads').attach('image', await solidPng(width, height), { filename: 'item.png' });
  if (res.status !== 201) throw new Error(`upload failed: ${JSON.stringify(res.body)}`);
  return res.body.url as string;
}
