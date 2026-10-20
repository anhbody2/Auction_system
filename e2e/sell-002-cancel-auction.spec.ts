import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout } from './helpers';

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

test('sell-002: cancelling an auction; bids rejected, credit released, non-owner blocked', async ({ page }) => {
  await login(page, 'alice');
  // sell-005: the seller cancels before the start; once bids are in (started) only the admin can cancel.
  const upcoming = await createAuctionViaApi(page.request, { name: 'Cancel Me Vase', initialPrice: 100, startTime: inMinutes(60), duration: { value: 1, unit: 'hours' } });
  const auction = await createAuctionViaApi(page.request, { name: 'Cancel Me Jug', initialPrice: 100 });
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

  // Non-owner cannot cancel either auction
  await expect(page.getByRole('button', { name: /Cancel auction/ })).toHaveCount(0);
  expect((await page.request.post(`/api/auctions/${auction.id}/cancel`)).status()).toBe(403);
  await page.goto(`/auctions/${upcoming.id}`);
  await expect(page.getByTestId('status')).toHaveText('upcoming');
  await expect(page.getByRole('button', { name: /Cancel auction/ })).toHaveCount(0);
  expect((await page.request.post(`/api/auctions/${upcoming.id}/cancel`)).status()).toBe(403);
  await logout(page);

  // Seller cancels the upcoming auction
  await login(page, 'alice');
  await page.goto(`/auctions/${upcoming.id}`);
  await page.getByRole('button', { name: 'Cancel auction' }).click();
  await page.getByRole('button', { name: 'Yes, cancel auction' }).click();
  await expect(page.getByTestId('status')).toHaveText('cancelled');
  await logout(page);

  // The admin cancels the started auction that has carol's bid
  await login(page, 'admin');
  await page.goto(`/auctions/${auction.id}`);
  await page.getByRole('button', { name: 'Cancel auction (admin)' }).click();
  await expect(page.getByText('All 1 bid(s) will be voided')).toBeVisible();
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
  await expect(page.getByTestId('transactions').getByRole('row').nth(1)).toContainText('Auction cancelled: Cancel Me Jug');
});
