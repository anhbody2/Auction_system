import { expect, test } from '@playwright/test';
import { createSoldAuction, login, registerViaApi } from './helpers';

const TAG = Date.now().toString(36);

test('ui-2a.2: a won item appears with its price, Sell preselects it, a listed item reads Listed', async ({ page }) => {
  // alice sells, bob wins at $150; the auction is settled
  const sold = await createSoldAuction(page.request, `Owned kettle ${TAG}`);
  await login(page, 'bob');
  await page.goto('/dashboard');

  const card = page.getByTestId('goods-owned');
  await expect(card.getByRole('heading', { name: /Goods owned/ })).toBeVisible();
  const item = card.locator('[data-testid^="owned-"]').filter({ hasText: `Owned kettle ${TAG}` });
  await expect(item).toBeVisible();
  await expect(item).toContainText('Won $150.00');
  // Newest win first
  await expect(card.locator('.owned-item').first()).toContainText(`Owned kettle ${TAG}`);

  // Sell -> Create auction with this goods preselected
  await item.getByTestId('owned-sell').click();
  await expect(page).toHaveURL(/\/auctions\/new\?goodsId=\d+$/);
  const goodsId = Number(new URL(page.url()).searchParams.get('goodsId'));
  await expect(page.getByLabel('Goods', { exact: true })).toHaveValue(String(goodsId));
  await expect(page.getByLabel('Auction name')).toHaveValue(`Owned kettle ${TAG}`);

  // List it again through the form's API -> the dashboard shows Listed instead of Sell
  const res = await page.request.post('/api/auctions', {
    data: {
      goodsId,
      name: `Owned kettle ${TAG} again`,
      description: 'Won it, selling it on.',
      initialPrice: 160,
      startTime: new Date().toISOString(),
      duration: { value: 1, unit: 'hours' },
    },
  });
  expect(res.status()).toBe(201);
  await page.goto('/dashboard');
  await expect(item.getByTestId('owned-listed')).toHaveText('Listed');
  await expect(item.getByTestId('owned-sell')).toHaveCount(0);
  expect(sold.id).toBeGreaterThan(0);
});

test('ui-2a.2: a customer who has won nothing sees the empty state with a Browse link', async ({ page }) => {
  const user = `owned0_${TAG}`;
  await registerViaApi(page.request, user);
  await login(page, user);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/dashboard');
  await expect(page.getByTestId('goods-owned-empty')).toContainText('Nothing won yet.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.getByTestId('goods-owned-empty').getByRole('link', { name: 'Browse lots' }).click();
  await expect(page).toHaveURL(/\/$/);
});
