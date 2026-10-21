import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi, topUpViaApi } from './helpers';

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

test('sell-005: the seller cancels only before the start; after that only the admin can', async ({ page }) => {
  // A fresh bidder so locked credit starts at $0.00
  await registerViaApi(page.request, 'kim');
  await login(page, 'kim');
  await topUpViaApi(page.request, 500);
  await logout(page);

  await login(page, 'alice');
  const upcoming = await createAuctionViaApi(page.request, { name: 'Rule Lamp', startTime: inMinutes(60), duration: { value: 1, unit: 'hours' } });
  const started = await createAuctionViaApi(page.request, { name: 'Rule Clock', initialPrice: 100 });

  // Upcoming: the seller sees and uses 'Cancel auction'
  await page.goto(`/auctions/${upcoming.id}`);
  await page.getByRole('button', { name: 'Cancel auction' }).click();
  await page.getByRole('button', { name: 'Yes, cancel auction' }).click();
  await expect(page.getByTestId('status')).toHaveText('cancelled');
  await expect(page.getByRole('button', { name: /Cancel auction/ })).toHaveCount(0);
  await logout(page);

  // kim bids on the started auction
  await login(page, 'kim');
  expect((await page.request.post(`/api/auctions/${started.id}/bids`, { data: { amount: 100 } })).status()).toBe(201);
  await page.goto('/credit');
  await expect(page.getByTestId('credit-held')).toHaveText('$100.00');
  await logout(page);

  // Started: no cancel button for the seller, and the server refuses
  await login(page, 'alice');
  await page.goto(`/auctions/${started.id}`);
  await expect(page.getByTestId('status')).toHaveText('active');
  await expect(page.getByRole('button', { name: /Cancel auction/ })).toHaveCount(0);
  const refused = await page.request.post(`/api/auctions/${started.id}/cancel`);
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toBe('This auction has started; only an admin can cancel it');
  await logout(page);

  // The admin cancels it
  await login(page, 'admin');
  await page.goto(`/auctions/${started.id}`);
  await page.getByRole('button', { name: 'Cancel auction (admin)' }).click();
  await page.getByRole('button', { name: 'Yes, cancel auction' }).click();
  await expect(page.getByTestId('status')).toHaveText('cancelled');
  await expect(page.getByRole('button', { name: /Cancel auction/ })).toHaveCount(0);
  await logout(page);

  // The bidder's locked credit is back to $0.00
  await login(page, 'kim');
  await page.goto('/credit');
  await expect(page.getByTestId('credit-held')).toHaveText('$0.00');
  await expect(page.getByTestId('credit-balance')).toHaveText('$500.00');
  await expect(page.getByTestId('transactions').getByRole('row').nth(1)).toContainText('Auction cancelled: Rule Clock');
});
