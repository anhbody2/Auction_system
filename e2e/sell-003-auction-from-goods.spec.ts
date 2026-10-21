import { expect, test } from '@playwright/test';
import { createAuctionViaApi, createGoodsViaApi, login, logout, registerViaApi } from './helpers';

test('sell-003: seller creates an auction from available goods; busy goods are not listed; the goods show in auction', async ({ page }) => {
  await registerViaApi(page.request, 'goods_seller');
  await login(page, 'goods_seller');
  const goods = await createGoodsViaApi(page.request, { name: 'Copper Kettle', description: 'A hammered copper kettle, polished.' });
  await createAuctionViaApi(page.request, { name: 'Busy Mirror' });

  await page.goto('/auctions/new');
  // No goods details or image URL on the form any more.
  await expect(page.getByLabel('Image URL (optional)')).toHaveCount(0);
  await expect(page.getByLabel('Category')).toHaveCount(0);
  await expect(page.getByLabel('Condition')).toHaveCount(0);
  // sell-006: goods in an auction are not listed at all (they used to be disabled options).
  await expect(page.getByLabel('Goods').locator('option', { hasText: 'Busy Mirror' })).toHaveCount(0);
  await expect(page.getByLabel('Goods').locator('option', { hasText: 'Copper Kettle' })).toHaveCount(1);

  await page.getByLabel('Goods').selectOption({ label: 'Copper Kettle' });
  const preview = page.getByTestId('goods-preview');
  await expect(preview.getByRole('img', { name: 'Copper Kettle image 1' })).toHaveAttribute('src', goods.images[0]);
  await expect(page.getByLabel('Auction name')).toHaveValue('Copper Kettle');
  await page.getByLabel('Starting price').fill('40');
  await page.getByRole('button', { name: 'Create auction' }).click();

  await expect(page.getByRole('heading', { name: 'Copper Kettle' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Copper Kettle' })).toHaveAttribute('src', goods.images[0]);

  await page.goto('/goods');
  const row = page.getByTestId('my-goods').getByRole('row', { name: /Copper Kettle/ });
  await expect(row.getByTestId('goods-status')).toHaveText('in auction');

  // Everything is in an auction now: the form is replaced by the Add goods link.
  await page.goto('/auctions/new');
  await expect(page.getByTestId('no-goods')).toContainText('All your goods are in an auction or sold.');
  await page.getByRole('link', { name: 'Add goods' }).click();
  await expect(page).toHaveURL(/\/goods\/new$/);
  await logout(page);
});

test('sell-003: a seller with no goods sees the Add goods link instead of the form', async ({ page }) => {
  await registerViaApi(page.request, 'empty_seller');
  await login(page, 'empty_seller');
  await page.goto('/auctions/new');
  await expect(page.getByTestId('no-goods')).toContainText("You haven't added any goods yet.");
  await expect(page.getByRole('button', { name: 'Create auction' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Add goods' })).toHaveAttribute('href', '/goods/new');
});
