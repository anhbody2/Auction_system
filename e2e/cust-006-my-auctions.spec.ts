import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi } from './helpers';

test('cust-006: seller sees own auctions by status with highest bid, and opens one', async ({ page }) => {
  // A fresh seller so the list contains only this test's auctions
  await registerViaApi(page.request, 'ivy');
  await login(page, 'ivy');
  const soon = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  const active = await createAuctionViaApi(page.request, { name: 'Ivy Active', initialPrice: 40 });
  const upcoming = await createAuctionViaApi(page.request, { name: 'Ivy Upcoming', startTime: soon(60), duration: { value: 1, unit: 'hours' } });
  const ended = await createAuctionViaApi(page.request, { name: 'Ivy Ended' });
  await page.request.post(`/api/dev/auctions/${ended.id}/expire`);
  // A seller can cancel only before the start time (sell-005)
  const cancelled = await createAuctionViaApi(page.request, { name: 'Ivy Cancelled', startTime: soon(60), duration: { value: 1, unit: 'hours' } });
  expect((await page.request.post(`/api/auctions/${cancelled.id}/cancel`)).status()).toBe(200);
  await logout(page);

  await login(page, 'bob');
  await page.request.post(`/api/auctions/${active.id}/bids`, { data: { amount: 55 } });
  await createAuctionViaApi(page.request, { name: 'Not Ivy' });
  await logout(page);

  await login(page, 'ivy');
  await page.getByRole('link', { name: 'My Auctions' }).click();
  const table = page.getByTestId('my-auctions');
  await expect(table.getByRole('row')).toHaveCount(5);
  await expect(table).not.toContainText('Not Ivy');

  const expectRow = async (id: number, status: string, highest: string) => {
    const row = page.getByTestId(`my-auction-${id}`);
    await expect(row.getByTestId('status')).toHaveText(status);
    await expect(row.getByTestId('highest-bid')).toHaveText(highest);
  };
  await expectRow(active.id, 'active', '$55.00');
  await expectRow(upcoming.id, 'upcoming', 'No bids');
  await expectRow(ended.id, 'ended', 'No bids');
  await expectRow(cancelled.id, 'cancelled', 'No bids');

  // Filter tabs
  await page.getByRole('tab', { name: /Cancelled/ }).click();
  await expect(table.getByRole('row')).toHaveCount(2);
  await page.getByRole('tab', { name: /All/ }).click();

  // Open one: details + bid history
  await table.getByRole('link', { name: 'Ivy Active' }).click();
  await expect(page.getByRole('heading', { name: 'Ivy Active' })).toBeVisible();
  await expect(page.getByTestId('current-price')).toHaveText('$55.00');
  await expect(page.getByTestId('bid-history').getByRole('row').nth(1)).toContainText('bob');
  await expect(page.getByTestId('bid-history').getByRole('row').nth(1)).toContainText('$55.00');
});
