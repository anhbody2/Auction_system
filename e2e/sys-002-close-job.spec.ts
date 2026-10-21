import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi, topUpViaApi } from './helpers';

// The e2e API server runs the scheduler every second with the production per-request safety net on.
// be/tests/job.close.test.ts covers the job closing auctions on its own (SETTLE_ON_REQUEST=0).
test('sys-002: after the close job runs, the auction is ended and winner and seller balances are settled', async ({ page }) => {
  await registerViaApi(page.request, 'sam_seller');
  await registerViaApi(page.request, 'wendy_winner');

  await login(page, 'sam_seller');
  const auction = await createAuctionViaApi(page.request, { name: 'Closing Teapot', initialPrice: 100, reservePrice: 150 });
  await logout(page);

  await login(page, 'wendy_winner');
  await topUpViaApi(page.request, 400);
  expect((await page.request.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 150 } })).status()).toBe(201);

  const raw = async () => (await (await page.request.get(`/api/dev/auctions/${auction.id}/raw`)).json()).status;
  await page.request.post(`/api/dev/auctions/${auction.id}/expire`);
  await expect.poll(raw, { timeout: 15_000 }).toBe('ended');

  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByTestId('status')).toHaveText('ended');
  await page.goto('/credit');
  await expect(page.getByTestId('credit-balance')).toHaveText('$250.00');
  await expect(page.getByTestId('credit-held')).toHaveText('$0.00');
  await logout(page);

  // $150 sale: seller receives the price minus the system commission
  await login(page, 'sam_seller');
  await page.goto('/credit');
  await expect(page.getByTestId('credit-balance')).toHaveText('$142.50');
  await expect(page.getByTestId('transactions')).toContainText('Sold: Closing Teapot');
});
