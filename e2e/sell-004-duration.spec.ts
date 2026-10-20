import { expect, test } from '@playwright/test';
import { createGoodsViaApi, login } from './helpers';

const local = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

test('sell-004: seller enters a start time and a duration; the end time is worked out and stored', async ({ page }) => {
  await login(page, 'alice');
  await createGoodsViaApi(page.request, { name: 'Duration Globe', description: 'A desk globe on a brass stand.' });
  await page.goto('/auctions/new');
  await page.getByLabel('Goods').selectOption({ label: 'Duration Globe' });
  await page.getByLabel('Starting price').fill('30');

  // Two boxes: a number and a unit (Hours or Days); no end date input.
  await expect(page.getByLabel('End time')).toHaveCount(0);
  await expect(page.getByLabel('Duration unit').locator('option')).toHaveText(['Hours', 'Days']);

  const start = new Date(Date.now() + 2 * 3600_000);
  start.setSeconds(0, 0);
  await page.getByLabel('Start time').fill(local(start));
  await page.getByLabel('Duration amount').fill('2');
  await page.getByLabel('Duration unit').selectOption('Days');
  const expectedEnd = new Date(start.getTime() + 48 * 3600_000);
  const endText = await page.evaluate((ms) => new Date(ms).toLocaleString(), expectedEnd.getTime());
  await expect(page.getByTestId('ends-at')).toHaveText(`Ends ${endText}`);

  // 31 days and 0 hours: message, nothing sent.
  let posted = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/auctions')) posted++;
  });
  await page.getByLabel('Duration amount').fill('31');
  await page.getByRole('button', { name: 'Create auction' }).click();
  await expect(page.getByRole('alert')).toHaveText('Duration must be between 1 hour and 30 days');
  await page.getByLabel('Duration amount').fill('0');
  await page.getByLabel('Duration unit').selectOption('Hours');
  await page.getByRole('button', { name: 'Create auction' }).click();
  await expect(page.getByRole('alert')).toHaveText('Duration must be between 1 hour and 30 days');
  expect(posted).toBe(0);
  await expect(page).toHaveURL(/\/auctions\/new$/);

  // Back to 2 days and create: the detail page shows the end the server worked out.
  await page.getByLabel('Duration amount').fill('2');
  await page.getByLabel('Duration unit').selectOption('Days');
  await expect(page.getByTestId('ends-at')).toHaveText(`Ends ${endText}`);
  await page.getByRole('button', { name: 'Create auction' }).click();
  await expect(page.getByRole('heading', { name: 'Duration Globe' })).toBeVisible();
  expect(posted).toBe(1);
  await expect(page.getByTestId('end-time')).toHaveText(endText);

  const id = page.url().split('/').pop();
  const raw = await (await page.request.get(`/api/dev/auctions/${id}/raw`)).json();
  expect(new Date(raw.endTime).getTime() - new Date(raw.startTime).getTime()).toBe(48 * 3600_000);
  expect(raw.durationMinutes).toBe(2880);
});
