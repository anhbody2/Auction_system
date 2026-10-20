import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { login } from './helpers';

const solidPng = () => sharp({ create: { width: 320, height: 240, channels: 3, background: '#2a9d8f' } }).png().toBuffer();
/** Noise barely compresses: 2600x1600 PNG is about 12 MB. */
const bigPng = () =>
  sharp({ create: { width: 2600, height: 1600, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 60 } } })
    .png({ compressionLevel: 1 })
    .toBuffer();

test('upl-001: seller uploads an image from the device, sees the preview, and the auction shows it', async ({ page }) => {
  await login(page, 'alice');
  await page.goto('/auctions/new');
  await expect(page.getByLabel('Image URL (optional)')).toHaveCount(0);

  // Not an image: refused with a clear message, no preview.
  await page.getByLabel('Image (optional)').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert')).toHaveText('Only JPEG, PNG and WebP images are accepted');
  await expect(page.getByTestId('imageUrl-previews')).toHaveCount(0);

  // Small PNG: stored as is and previewed from the server.
  await page.getByLabel('Image (optional)').setInputFiles({ name: 'lamp.png', mimeType: 'image/png', buffer: await solidPng() });
  const preview = page.getByRole('img', { name: 'Uploaded image 1' });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('src', /^\/uploads\/[0-9a-f]{32}\.png$/);
  expect(await preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320);
  const src = (await preview.getAttribute('src'))!;
  const served = await page.request.get(src);
  expect(served.status()).toBe(200);
  expect(served.headers()['content-type']).toMatch(/^image\/png/);

  // Create the auction: its page shows the uploaded image.
  await page.getByLabel('Item name').fill('Uploaded Lamp');
  await page.getByLabel('Description').fill('A desk lamp photographed by the seller.');
  await page.getByLabel('Category').selectOption({ label: 'Collectibles' });
  await page.getByLabel('Condition').selectOption({ label: 'Used' });
  await page.getByLabel('Starting price').fill('50');
  await page.getByRole('button', { name: 'Create auction' }).click();
  await expect(page.getByRole('heading', { name: 'Uploaded Lamp' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Uploaded Lamp' })).toHaveAttribute('src', src);
});

test('upl-001: an image over 5 MB is resized by the server and the seller is told', async ({ page }) => {
  await login(page, 'alice');
  await page.goto('/auctions/new');
  const big = await bigPng();
  expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
  await page.getByLabel('Image (optional)').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: big });
  const preview = page.getByRole('img', { name: 'Uploaded image 1' });
  await expect(preview).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^Resized from 1\d\.\d MB to [0-5]\.\d MB to fit the 5 MB limit$/)).toBeVisible();
  const stored = await page.request.get((await preview.getAttribute('src'))!);
  expect((await stored.body()).length).toBeLessThanOrEqual(5 * 1024 * 1024);
  expect(await preview.evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight)).toBeCloseTo(2600 / 1600, 2);
});
