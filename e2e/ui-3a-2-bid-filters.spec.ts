import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login, registerViaApi, topUpViaApi } from './helpers';

const TAG = Date.now().toString(36);

async function apiAs(baseURL: string | undefined, identifier: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  expect((await ctx.post('/api/auth/login', { data: { identifier, password: PASSWORD } })).status()).toBe(200);
  return ctx;
}

test('ui-3a.2: result tabs and lot search filter, combine, survive reload and Back', async ({ page, baseURL }) => {
  const user = `filt_${TAG}`;
  await registerViaApi(page.request, user);
  await login(page, user);
  await topUpViaApi(page.request, 1000);

  const alice = await apiAs(baseURL, 'alice');
  const carol = await apiAs(baseURL, 'carol');
  const mk = (name: string) => createAuctionViaApi(alice, { name: `${name} ${TAG}`, initialPrice: 10 });
  const [won, lost, leading, outbid, cancelled] = [await mk('Brass lamp'), await mk('Oak table'), await mk('Lamp shade'), await mk('Silk scarf'), await mk('Old lamp')];
  const bid = (ctx: APIRequestContext, id: number, amount: number) => ctx.post(`/api/auctions/${id}/bids`, { data: { amount } });
  await expect(async () => expect((await bid(page.request, won.id, 10)).status()).toBe(201)).toPass({ timeout: 15_000 });
  expect((await bid(page.request, lost.id, 10)).status()).toBe(201);
  expect((await bid(carol, lost.id, 11)).status()).toBe(201);
  expect((await bid(page.request, leading.id, 10)).status()).toBe(201);
  expect((await bid(page.request, outbid.id, 10)).status()).toBe(201);
  expect((await bid(carol, outbid.id, 11)).status()).toBe(201);
  expect((await bid(page.request, cancelled.id, 10)).status()).toBe(201);
  for (const id of [won.id, lost.id]) {
    await alice.post(`/api/dev/auctions/${id}/expire`);
    await expect.poll(async () => (await (await alice.get(`/api/dev/auctions/${id}/raw`)).json()).status).toBe('ended');
  }
  const admin = await apiAs(baseURL, 'admin');
  expect((await admin.post(`/api/auctions/${cancelled.id}/cancel`)).status()).toBe(200);
  await Promise.all([alice.dispose(), carol.dispose(), admin.dispose()]);

  await page.goto('/my-bids');
  const tabs = page.getByTestId('history-tabs');
  const rows = page.getByTestId('my-bids').locator('tbody tr');
  const tabNamed = (label: string) => tabs.getByRole('tab', { name: new RegExp(`^${label}`) });
  await expect(tabNamed('All')).toHaveText('All · 5');
  await expect(tabNamed('Active')).toHaveText('Active · 2');
  await expect(rows).toHaveCount(5);

  // Active = Leading + Outbid; cancelled shows under All only
  await tabNamed('Active').click();
  await expect(tabNamed('Active')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\?tab=active$/);
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId(`my-bid-${leading.id}`)).toBeVisible();
  await expect(page.getByTestId(`my-bid-${outbid.id}`)).toBeVisible();
  await tabNamed('Won').click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId(`my-bid-${won.id}`)).toBeVisible();
  await tabNamed('Lost').click();
  await expect(page.getByTestId(`my-bid-${lost.id}`)).toBeVisible();
  await expect(page.getByTestId(`my-bid-${cancelled.id}`)).toHaveCount(0);

  // Back restores the previous tab
  await page.goBack();
  await expect(tabNamed('Won')).toHaveAttribute('aria-selected', 'true');

  // Search by name narrows within the tab and updates the counts
  await tabNamed('All').click();
  await page.getByTestId('history-search').fill('lamp');
  await expect(rows).toHaveCount(3);
  await expect(tabNamed('All')).toHaveText('All · 3');
  await expect(tabNamed('Active')).toHaveText('Active · 1');
  // Search by lot number, with and without '#'
  await page.getByTestId('history-search').fill(`#${outbid.id}`);
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId(`my-bid-${outbid.id}`)).toBeVisible();
  await page.getByTestId('history-search').fill(String(won.id));
  await expect(page.getByTestId(`my-bid-${won.id}`)).toBeVisible();

  // Combined and kept across a reload
  await page.getByTestId('history-search').fill('lamp');
  await tabNamed('Active').click();
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId(`my-bid-${leading.id}`)).toBeVisible();
  await page.reload();
  await expect(tabNamed('Active')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('history-search')).toHaveValue('lamp');
  await expect(rows).toHaveCount(1);

  // Nothing left -> 'No bids match.'
  await tabNamed('Lost').click();
  await expect(page.getByTestId('no-match')).toHaveText('No bids match.');

  // 375px: no sideways page scroll
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
