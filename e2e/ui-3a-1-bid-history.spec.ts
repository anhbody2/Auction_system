import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login, registerViaApi, topUpViaApi } from './helpers';

const TAG = Date.now().toString(36);

async function apiAs(baseURL: string | undefined, identifier: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  expect((await ctx.post('/api/auth/login', { data: { identifier, password: PASSWORD } })).status()).toBe(200);
  return ctx;
}

async function expireAndSettle(ctx: APIRequestContext, id: number) {
  await ctx.post(`/api/dev/auctions/${id}/expire`);
  await expect.poll(async () => (await (await ctx.get(`/api/dev/auctions/${id}/raw`)).json()).status).toBe('ended');
}

test('ui-3a.1: totals, win rate, credit state and result per lot', async ({ page, baseURL }) => {
  const user = `hist_${TAG}`;
  await registerViaApi(page.request, user);
  await login(page, user);
  await topUpViaApi(page.request, 1000);

  const alice = await apiAs(baseURL, 'alice');
  const carol = await apiAs(baseURL, 'carol');
  const mk = (name: string) => createAuctionViaApi(alice, { name: `${name} ${TAG}`, initialPrice: 10 });
  const [won, lost, leading, outbid] = [await mk('Hist won'), await mk('Hist lost'), await mk('Hist leading'), await mk('Hist outbid')];
  const bid = (ctx: APIRequestContext, id: number, amount: number) => ctx.post(`/api/auctions/${id}/bids`, { data: { amount } });
  await expect(async () => expect((await bid(page.request, won.id, 10)).status()).toBe(201)).toPass({ timeout: 15_000 });
  expect((await bid(page.request, won.id, 11)).status()).toBe(201); // raises own bid
  expect((await bid(page.request, lost.id, 10)).status()).toBe(201);
  expect((await bid(carol, lost.id, 11)).status()).toBe(201);
  expect((await bid(page.request, leading.id, 10)).status()).toBe(201);
  expect((await bid(page.request, outbid.id, 10)).status()).toBe(201);
  expect((await bid(carol, outbid.id, 11)).status()).toBe(201);
  await expireAndSettle(alice, won.id);
  await expireAndSettle(alice, lost.id);
  await alice.dispose();
  await carol.dispose();

  await page.locator('header nav').getByRole('link', { name: 'Bids', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bid history' })).toBeVisible();
  // 5 bids placed (2 on 'won', 1 on each other lot); 1 won + 1 lost -> 50%
  await expect(page.getByTestId('bids-placed')).toHaveText('5');
  await expect(page.getByTestId('win-rate')).toHaveText('50%');

  const row = (id: number) => page.getByTestId(`my-bid-${id}`);
  const expectRow = async (id: number, result: string, credit: string) => {
    await expect(row(id).getByTestId('my-status')).toHaveText(result);
    await expect(row(id).getByTestId('credit-state')).toHaveText(credit);
  };
  await expectRow(won.id, 'Won', 'Charged');
  await expectRow(lost.id, 'Lost', 'Released');
  await expectRow(leading.id, 'Leading', 'Locked');
  await expectRow(outbid.id, 'Outbid', 'Released');
  await expect(row(won.id)).toContainText(`Lot #${won.id}`);
  await expect(row(won.id)).toContainText('2 bids');
  await expect(row(won.id).getByTestId('my-latest')).toHaveText('$11.00');
  await expect(row(outbid.id).getByTestId('highest')).toHaveText('$11.00');
  await expect(row(leading.id).getByTestId('placed')).toHaveText(/\d/);
  // Newest first: the last lot bid on is on top
  await expect(page.getByTestId('my-bids').locator('tbody tr').first()).toHaveAttribute('data-testid', `my-bid-${outbid.id}`);

  // 375px: the table scrolls inside its wrapper, not the page
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(await page.locator('.table-wrap').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

test("ui-3a.1: win rate reads '-' before any lot finishes", async ({ page }) => {
  const user = `hist0_${TAG}`;
  await registerViaApi(page.request, user);
  await login(page, user);
  await page.goto('/my-bids');
  await expect(page.getByTestId('bids-placed')).toHaveText('0');
  await expect(page.getByTestId('win-rate')).toHaveText('-');
});
