import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

test('sell-002: seller cancels an auction; bids rejected, credit released, non-owner blocked', async ({ page }) => {
  await login(page, 'alice');
  const auction = await createAuctionViaApi(page.request, { name: 'Cancel Me Vase', initialPrice: 100 });
  await logout(page);

  // carol bids so she has credit held
  await login(page, 'carol');
  // Other specs share this DB, so compare against carol's balances before this test.
  const start = await (await page.request.get('/api/credit')).json();
  const before = start.available;
  await page.goto(`/auctions/${auction.id}`);
  await page.getByLabel('Your bid').fill('150');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByTestId('current-price')).toHaveText('$150.00');
  expect((await (await page.request.get('/api/credit')).json()).held).toBe(start.held + 150);

  // Non-owner cannot cancel
  await expect(page.getByRole('button', { name: 'Cancel auction' })).toHaveCount(0);
  expect((await page.request.post(`/api/auctions/${auction.id}/cancel`)).status()).toBe(403);
  await logout(page);

  // Seller cancels
  await login(page, 'alice');
  await page.goto(`/auctions/${auction.id}`);
  await page.getByRole('button', { name: 'Cancel auction' }).click();
  await page.getByRole('button', { name: 'Yes, cancel auction' }).click();
  await expect(page.getByTestId('status')).toHaveText('cancelled');
  await logout(page);

  // Bidder: bid rejected, held credit released
  await login(page, 'carol');
  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByText('This auction was cancelled and no longer accepts bids.')).toBeVisible();
  const late = await page.request.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 300 } });
  expect(late.status()).toBe(400);
  const credit = await (await page.request.get('/api/credit')).json();
  expect(credit.held).toBe(start.held);
  expect(credit.available).toBe(before);
  await page.goto('/credit');
  await expect(page.getByTestId('transactions').getByRole('row').nth(1)).toContainText('Auction cancelled: Cancel Me Vase');
});
