import { expect, test } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, createGoodsViaApi, login, registerViaApi } from './helpers';

test('sell-006: the create-auction goods dropdown lists only available goods', async ({ page, browser }) => {
  await registerViaApi(page.request, 'av_seller');
  await login(page, 'av_seller');
  await createGoodsViaApi(page.request, { name: 'Free Teapot' });
  const busy = await createGoodsViaApi(page.request, { name: 'Busy Teapot' });
  await createAuctionViaApi(page.request, { name: 'Busy Teapot', goodsId: busy.id });
  const sold = await createGoodsViaApi(page.request, { name: 'Sold Teapot' });
  const soldAuction = await createAuctionViaApi(page.request, { name: 'Sold Teapot', goodsId: sold.id, initialPrice: 50 });

  // A bidder buys the third item, so its goods are sold.
  const bidderContext = await browser.newContext({ baseURL: 'http://localhost:5180' });
  const bidder = bidderContext.request;
  await registerViaApi(bidder, 'av_bidder');
  await bidder.post('/api/auth/login', { data: { identifier: 'av_bidder', password: PASSWORD } });
  expect((await bidder.post('/api/credit/topup', { data: { amount: 100 } })).status()).toBe(201);
  expect((await bidder.post(`/api/auctions/${soldAuction.id}/bids`, { data: { amount: 50 } })).status()).toBe(201);
  await bidder.post(`/api/dev/auctions/${soldAuction.id}/expire`);
  await expect.poll(async () => (await (await bidder.get(`/api/dev/auctions/${soldAuction.id}/raw`)).json()).status, { timeout: 15_000 }).toBe('ended');
  await bidderContext.close();

  const statuses = (await (await page.request.get('/api/me/goods')).json()).goods.map((g: { name: string; status: string }) => `${g.name}:${g.status}`);
  expect(statuses.sort()).toEqual(['Busy Teapot:in_auction', 'Free Teapot:available', 'Sold Teapot:sold']);

  await page.goto('/auctions/new');
  const select = page.getByLabel('Goods');
  await expect(select.locator('option')).toHaveCount(2);
  await expect(select.locator('option')).toHaveText(['Choose goods...', 'Free Teapot']);
  await expect(select).not.toContainText('Busy Teapot');
  await expect(select).not.toContainText('Sold Teapot');
  await expect(page.getByTestId('goods-not-available')).toHaveCount(0);

  // A link to goods that are in an auction preselects nothing and says why
  await page.goto(`/auctions/new?goodsId=${busy.id}`);
  await expect(page.getByLabel('Goods')).toHaveValue('');
  await expect(page.getByTestId('goods-not-available')).toHaveText('That goods item is not available for a new auction');
  await expect(page.getByTestId('goods-preview')).toHaveCount(0);
  await expect(page.getByLabel('Auction name')).toHaveValue('');
  // Picking an available item clears the message
  await page.getByLabel('Goods').selectOption({ label: 'Free Teapot' });
  await expect(page.getByTestId('goods-not-available')).toHaveCount(0);
  await expect(page.getByLabel('Auction name')).toHaveValue('Free Teapot');

  // Once the last available item is in an auction, the existing message and Add goods link appear
  const free = (await (await page.request.get('/api/me/goods?status=available')).json()).goods[0];
  await createAuctionViaApi(page.request, { name: 'Free Teapot', goodsId: free.id });
  await page.goto('/auctions/new');
  await expect(page.getByTestId('no-goods')).toContainText('All your goods are in an auction or sold.');
  await expect(page.getByRole('link', { name: 'Add goods' })).toBeVisible();
  await expect(page.getByLabel('Goods')).toHaveCount(0);
});
