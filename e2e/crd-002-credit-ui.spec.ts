import { expect, test, type Page } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi, topUpViaApi } from './helpers';

/** Header pill, dashboard and /credit all show Credit and Locked credit, never 'Available credit'. */
async function expectCreditEverywhere(page: Page, credit: string, locked: string) {
  await page.goto('/dashboard');
  await expect(page.getByTestId('header-credit')).toHaveText(credit);
  await expect(page.getByTestId('header-locked')).toHaveText(locked);
  await expect(page.getByTestId('dashboard-credit')).toHaveText(credit);
  await expect(page.getByTestId('dashboard-locked')).toHaveText(locked);
  await expect(page.getByText('Locked credit', { exact: true })).toBeVisible();
  await expect(page.getByText(/available credit/i)).toHaveCount(0);

  await page.goto('/credit');
  await expect(page.getByTestId('credit-balance')).toHaveText(credit);
  await expect(page.getByTestId('credit-held')).toHaveText(locked);
  await expect(page.getByTestId('credit-available')).toHaveCount(0);
  await expect(page.getByText(/available credit/i)).toHaveCount(0);
}

test('crd-002: a bid changes Locked credit but not Credit; Credit drops only when the auction closes', async ({ page }) => {
  await registerViaApi(page.request, 'ui_seller');
  await registerViaApi(page.request, 'ui_bidder');

  await login(page, 'ui_seller');
  const auction = await createAuctionViaApi(page.request, { name: 'Label Test Vase', initialPrice: 100 });
  await logout(page);

  await login(page, 'ui_bidder');
  await topUpViaApi(page.request, 1000);
  await expectCreditEverywhere(page, '$1,000.00', '$0.00');

  // Bid through the UI: the header pill updates the lock, the credit stays.
  await page.goto(`/auctions/${auction.id}`);
  await page.getByLabel('Your bid').fill('100');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByTestId('current-price')).toHaveText('$100.00');
  await expect(page.getByTestId('header-locked')).toHaveText('$100.00');
  await expect(page.getByTestId('header-credit')).toHaveText('$1,000.00');
  await expectCreditEverywhere(page, '$1,000.00', '$100.00');
  // The ledger's hold row leaves Credit after unchanged.
  await expect(page.getByTestId('transactions').getByRole('row').nth(1)).toContainText('hold');
  await expect(page.getByTestId('transactions').getByRole('row').nth(1).getByRole('cell').last()).toHaveText('$1,000.00');

  // Close with this bidder as winner.
  await page.request.post(`/api/dev/auctions/${auction.id}/expire`);
  const raw = async () => (await (await page.request.get(`/api/dev/auctions/${auction.id}/raw`)).json()).status;
  await expect.poll(raw, { timeout: 15_000 }).toBe('ended');
  await expectCreditEverywhere(page, '$900.00', '$0.00');
  await expect(page.getByTestId('transactions').getByRole('row').nth(1)).toContainText('payment');
  await expect(page.getByTestId('transactions').getByRole('row').nth(1).getByRole('cell').last()).toHaveText('$900.00');
});
