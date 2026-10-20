import sharp from 'sharp';

/** Random noise barely compresses, so these sizes give files well over 5 MB. */
export function noiseImage(width: number, height: number, format: 'png' | 'jpeg') {
  const img = sharp({ create: { width, height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } } });
  return (format === 'png' ? img.png({ compressionLevel: 1 }) : img.jpeg({ quality: 100 })).toBuffer();
}

export const solidPng = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#3366cc' } }).png().toBuffer();
