import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi } from './helpers';

test('sys-003: seller proceeds are reduced by the tiered commission (5% at $150, 10% at $60)', async ({ page }) => {
  await registerViaApi(page.request, 'tia_seller');
  await registerViaApi(page.request, 'tom_buyer');

  await login(page, 'tia_seller');
  const mid = await createAuctionViaApi(page.request, { name: 'Commission Lamp', initialPrice: 150, minIncrement: null });
  const low = await createAuctionViaApi(page.request, { name: 'Commission Cup', initialPrice: 60, minIncrement: null });
  await logout(page);

  await login(page, 'tom_buyer');
  await page.request.post('/api/credit/topup', { data: { amount: 500 } });
  for (const [a, amount] of [[mid, 150], [low, 60]] as const) {
    expect((await page.request.post(`/api/auctions/${a.id}/bids`, { data: { amount } })).status()).toBe(201);
    await page.request.post(`/api/dev/auctions/${a.id}/expire`);
  }
  const raw = async (id: number) => (await (await page.request.get(`/api/dev/auctions/${id}/raw`)).json()).status;
  await expect.poll(() => raw(mid.id)).toBe('ended');
  await expect.poll(() => raw(low.id)).toBe('ended');
  await logout(page);

  await login(page, 'tia_seller');
  await page.goto('/credit');
  // 150 - 7.50 + 60 - 6.00
  await expect(page.getByTestId('credit-balance')).toHaveText('$196.50');
  await expect(page.getByTestId('transactions')).toContainText('Sold: Commission Lamp (commission $7.50, 5%)');
  await expect(page.getByTestId('transactions')).toContainText('Sold: Commission Cup (commission $6.00, 10%)');
});
