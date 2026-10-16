import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login } from './helpers';

// The e2e API server runs the scheduler with AUCTION_JOB_INTERVAL_MS=1000.
test('sys-001: an upcoming auction becomes active once the start job runs', async ({ page }) => {
  await login(page, 'alice');
  const auction = await createAuctionViaApi(page.request, {
    name: 'Soon Starting Clock',
    startTime: new Date(Date.now() + 4000).toISOString(),
    endTime: new Date(Date.now() + 3600_000).toISOString(),
  });
  const raw = async () => (await (await page.request.get(`/api/dev/auctions/${auction.id}/raw`)).json()).status;

  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByTestId('status')).toHaveText('upcoming');
  expect(await raw()).toBe('upcoming');

  await expect.poll(raw, { timeout: 15_000 }).toBe('active');
  await page.reload();
  await expect(page.getByTestId('status')).toHaveText('active');
});
