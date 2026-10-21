import { expect, test, type Page } from '@playwright/test';
import { createGoodsViaApi, login, logout, registerViaApi, topUpViaApi } from './helpers';

const TAG = Date.now().toString(36);

/** Bids as the logged-in user (topping up first), expires the auction and waits for the close job. */
async function winAuction(page: Page, auctionId: number, amount: number) {
  await topUpViaApi(page.request, amount);
  expect((await page.request.post(`/api/auctions/${auctionId}/bids`, { data: { amount } })).status()).toBe(201);
  await page.request.post(`/api/dev/auctions/${auctionId}/expire`);
  const raw = async () => (await (await page.request.get(`/api/dev/auctions/${auctionId}/raw`)).json()).status;
  await expect.poll(raw, { timeout: 15_000 }).toBe('ended');
}

const goodsRow = (page: Page, name: string) => page.getByTestId('my-goods').getByRole('row', { name: new RegExp(name) });

test('gds-003: a buyer re-auctions goods they won; the goods pass seller -> buyer on each sale', async ({ page }) => {
  const [alice, bob, carol] = ['alice', 'bob', 'carol'].map((n) => `${n}_${TAG}`);
  for (const u of [alice, bob, carol]) await registerViaApi(page.request, u);
  const name = `Rosewood Clock ${TAG}`;

  // alice sells to bob through a short auction
  await login(page, alice);
  const goods = await createGoodsViaApi(page.request, { name, description: 'A rosewood mantel clock that keeps time.' });
  const first = await page.request.post('/api/auctions', {
    data: { goodsId: goods.id, name, description: 'A rosewood mantel clock.', initialPrice: 20, startTime: new Date().toISOString(), duration: { value: 1, unit: 'hours' } },
  });
  expect(first.status()).toBe(201);
  const firstId = (await first.json()).auction.id;
  await logout(page);

  await login(page, bob);
  await winAuction(page, firstId, 20);

  // bob sees the goods as bought and re-auctions them from My goods
  await page.goto('/goods');
  await expect(goodsRow(page, name).getByTestId('goods-status')).toHaveText('bought');
  await goodsRow(page, name).getByRole('link', { name: `Auction ${name}` }).click();
  await expect(page.getByLabel('Auction name')).toHaveValue(name);
  await page.getByLabel('Starting price').fill('30');
  await page.getByRole('button', { name: 'Create auction' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const resaleId = Number(page.url().match(/\/auctions\/(\d+)/)![1]);
  await page.goto('/goods');
  await expect(goodsRow(page, name).getByTestId('goods-status')).toHaveText('in auction');
  await logout(page);

  // alice, the first seller, sees it sold and cannot pick it for a new auction
  await login(page, alice);
  await page.goto('/goods');
  await expect(goodsRow(page, name).getByTestId('goods-status')).toHaveText('sold');
  await page.goto('/auctions/new');
  await expect(page.getByTestId('no-goods')).toBeVisible();
  await logout(page);

  // carol wins the resale
  await login(page, carol);
  await winAuction(page, resaleId, 30);
  await page.goto('/goods');
  await expect(goodsRow(page, name).getByTestId('goods-status')).toHaveText('bought');
  await logout(page);

  // bob is now the seller of record and sees it sold
  await login(page, bob);
  await page.goto('/goods');
  await expect(goodsRow(page, name).getByTestId('goods-status')).toHaveText('sold');
  await expect(goodsRow(page, name).getByRole('link', { name: `Auction ${name}` })).toHaveCount(0);
});
