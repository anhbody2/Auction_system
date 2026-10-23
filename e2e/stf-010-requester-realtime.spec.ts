import { expect, test, type Page } from '@playwright/test';
import { createGoodsViaApi, login, registerViaApi, staffApi } from './helpers';

const TAG = Date.now().toString(36);

/** Marks the page so a later check can tell it was never reloaded. */
const markLoaded = (page: Page) => page.evaluate(() => ((window as unknown as { __stf010: boolean }).__stf010 = true));
const expectNotReloaded = async (page: Page) => expect(await page.evaluate(() => (window as unknown as { __stf010?: boolean }).__stf010)).toBe(true);

test('stf-010: the seller sees staff decisions on goods and credit requests without reloading', async ({ page }) => {
  const seller = `rq_seller_${TAG}`;
  await registerViaApi(page.request, seller);
  await login(page, seller);
  const staff = await staffApi();

  // My Goods open; staff approve: the row turns available, 'Auction it' appears, a toast says so.
  const lamp = await createGoodsViaApi(page.request, { name: `Toast lamp ${TAG}` }, { approve: false });
  await page.goto('/goods');
  const lampRow = page.getByTestId(`goods-${lamp.id}`);
  await expect(lampRow.getByTestId('goods-status')).toHaveText('pending approval');
  await expect(lampRow.getByRole('link', { name: `Auction Toast lamp ${TAG}` })).toHaveCount(0);
  await markLoaded(page);

  expect((await staff.post(`/api/staff/goods/${lamp.id}/approve`)).status()).toBe(200);
  await expect(lampRow.getByTestId('goods-status')).toHaveText('available');
  await expect(lampRow.getByRole('link', { name: `Auction Toast lamp ${TAG}` })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: `Your goods "Toast lamp ${TAG}" were approved` })).toBeVisible();

  // Rejected with a reason: the row shows it, and so does the toast.
  const vase = await createGoodsViaApi(page.request, { name: `Toast vase ${TAG}` }, { approve: false });
  await page.reload();
  await markLoaded(page);
  const vaseRow = page.getByTestId(`goods-${vase.id}`);
  await expect(vaseRow.getByTestId('goods-status')).toHaveText('pending approval');
  expect((await staff.post(`/api/staff/goods/${vase.id}/reject`, { data: { reason: 'Blurry photo' } })).status()).toBe(200);
  await expect(vaseRow.getByTestId('goods-status')).toHaveText('rejected');
  await expect(vaseRow.getByTestId('rejection-reason')).toContainText('Reason: Blurry photo');
  await expect(page.getByRole('status').filter({ hasText: `Your goods "Toast vase ${TAG}" were rejected: Blurry photo` })).toBeVisible();
  await expectNotReloaded(page);

  // The create-auction dropdown gains goods approved while it is open.
  const clock = await createGoodsViaApi(page.request, { name: `Toast clock ${TAG}` }, { approve: false });
  await page.goto('/auctions/new');
  await markLoaded(page);
  const goodsSelect = page.locator('#goodsId');
  await expect(goodsSelect.locator('option', { hasText: `Toast lamp ${TAG}` })).toHaveCount(1);
  await expect(goodsSelect.locator('option', { hasText: `Toast clock ${TAG}` })).toHaveCount(0);
  expect((await staff.post(`/api/staff/goods/${clock.id}/approve`)).status()).toBe(200);
  await expect(goodsSelect.locator('option', { hasText: `Toast clock ${TAG}` })).toHaveCount(1);
  await expectNotReloaded(page);

  // Credit: a top-up approved by staff shows a toast and the new credit, on any page.
  const before = await page.getByTestId('header-credit').textContent();
  const topup = await page.request.post('/api/credit/topup', { data: { amount: 25 } });
  expect(topup.status()).toBe(201);
  const id = (await topup.json()).request.id as number;
  expect((await staff.post(`/api/staff/credit/requests/${id}/approve`)).status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Your top-up of $25.00 was approved' })).toBeVisible();
  await expect(page.getByTestId('header-credit')).not.toHaveText(before ?? '');

  // A rejected withdrawal shows the reason.
  const out = (await (await page.request.post('/api/credit/withdraw', { data: { amount: 5 } })).json()).request.id as number;
  expect((await staff.post(`/api/staff/credit/requests/${out}/reject`, { data: { reason: 'Bank details missing' } })).status()).toBe(200);
  await expect(page.getByRole('status').filter({ hasText: 'Your withdrawal of $5.00 was rejected: Bank details missing' })).toBeVisible();
  await expectNotReloaded(page);
});
