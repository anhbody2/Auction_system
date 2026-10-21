import { expect, test, type Page } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi, topUpViaApi } from './helpers';

async function expectCredit(page: Page, balance: string, held: string) {
  await page.goto('/credit');
  await expect(page.getByTestId('credit-balance')).toHaveText(balance);
  await expect(page.getByTestId('credit-held')).toHaveText(held);
}

test('crd-001: outbid credit is unlocked at once; the winner stays locked until close and then pays', async ({ page }) => {
  await registerViaApi(page.request, 'crd_seller');
  await registerViaApi(page.request, 'crd_first');
  await registerViaApi(page.request, 'crd_second');

  await login(page, 'crd_seller');
  const auction = await createAuctionViaApi(page.request, { name: 'Lock Test Clock', initialPrice: 100 });
  await logout(page);

  await login(page, 'crd_first');
  await topUpViaApi(page.request, 500);
  expect((await page.request.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 100 } })).status()).toBe(201);
  await expectCredit(page, '$500.00', '$100.00');
  await logout(page);

  await login(page, 'crd_second');
  await topUpViaApi(page.request, 500);
  expect((await page.request.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 150 } })).status()).toBe(201);
  await expectCredit(page, '$500.00', '$150.00');
  await logout(page);

  // Outbid: the lock is gone while the auction is still running.
  await login(page, 'crd_first');
  await expectCredit(page, '$500.00', '$0.00');
  await expect(page.getByTestId('transactions')).toContainText('Outbid on Lock Test Clock');
  await logout(page);

  await login(page, 'crd_second');
  await page.request.post(`/api/dev/auctions/${auction.id}/expire`);
  const raw = async () => (await (await page.request.get(`/api/dev/auctions/${auction.id}/raw`)).json()).status;
  await expect.poll(raw, { timeout: 15_000 }).toBe('ended');
  await expectCredit(page, '$350.00', '$0.00');
  await logout(page);

  await login(page, 'crd_first');
  await expectCredit(page, '$500.00', '$0.00');
});
