import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login } from './helpers';

const TAG = `hc${Date.now().toString(36)}`;

async function apiAs(baseURL: string | undefined, identifier: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  expect((await ctx.post('/api/auth/login', { data: { identifier, password: PASSWORD } })).status()).toBe(200);
  return ctx;
}

test('ui-1b.3: live history rows and chart points appear without reload; own bids say You', async ({ page, browser, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const auction = await createAuctionViaApi(alice, { name: `History clock ${TAG}`, initialPrice: 100 });
  await alice.dispose();

  // A (bob) opens the lot: no bids -> no chart, empty history
  await login(page, 'bob');
  await expect(async () => {
    await page.goto(`/auctions/${auction.id}`);
    await expect(page.getByTestId('bid-input')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId('price-chart')).toHaveCount(0);
  await expect(page.getByText('No bids yet.')).toBeVisible();
  await page.evaluate(() => ((window as unknown as { __ui1b3: boolean }).__ui1b3 = true));

  // A bids: own row in cream with 'You'; chart has start + 1 point
  await page.getByTestId('bid-input').fill('100');
  await page.getByTestId('place-bid').click();
  const history = page.getByTestId('bid-history');
  const firstRow = history.getByRole('row').nth(1);
  await expect(firstRow).toContainText('bob');
  await expect(firstRow.getByTestId('you')).toHaveText('You');
  await expect(firstRow).toHaveClass(/is-mine/);
  await expect(firstRow).toContainText('just now');
  await expect(page.getByTestId('price-chart')).toHaveAttribute('data-points', '2');
  await expect(page.getByTestId('price-chart')).toHaveAttribute('aria-label', 'Price from $100.00 to $100.00 over 1 bid');

  // B (carol) bids from another browser: A sees a new top row and a third chart point, no reload
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await login(b, 'carol');
  await b.goto(`/auctions/${auction.id}`);
  await b.getByTestId('quick-bid-1').click();
  await b.getByTestId('place-bid').click();
  await expect(b.getByTestId('bid-ok')).toBeVisible();
  // B sees A's row without the You pill
  await expect(b.getByTestId('bid-history').getByRole('row').nth(2)).toContainText('bob');
  await expect(b.getByTestId('bid-history').getByRole('row').nth(2).getByTestId('you')).toHaveCount(0);
  await ctxB.close();

  await expect(firstRow).toContainText('carol');
  await expect(firstRow.getByTestId('you')).toHaveCount(0);
  await expect(firstRow).toContainText('leading');
  await expect(history.getByRole('row').nth(2)).toContainText('outbid');
  await expect(history.getByRole('row').nth(2).getByTestId('you')).toHaveText('You');
  await expect(page.getByTestId('price-chart')).toHaveAttribute('data-points', '3');
  await expect(page.getByTestId('price-chart')).toHaveAttribute('aria-label', 'Price from $100.00 to $110.00 over 2 bids');
  // Full date in the tooltip
  await expect(firstRow.locator('[title]')).toHaveAttribute('title', /\d/);
  expect(await page.evaluate(() => (window as unknown as { __ui1b3?: boolean }).__ui1b3)).toBe(true);
});

test('ui-1b.3: guests see the history and chart; the list scrolls inside its card', async ({ page, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const auction = await createAuctionViaApi(alice, { name: `History long ${TAG}`, initialPrice: 10 });
  await alice.dispose();
  const bob = await apiAs(baseURL, 'bob');
  const carol = await apiAs(baseURL, 'carol');
  await expect(async () => {
    expect((await bob.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 10 } })).status()).toBe(201);
  }).toPass({ timeout: 15_000 });
  // 12 alternating bids, $1 apart (ladder step at $10-$50)
  for (let i = 1; i <= 11; i++) {
    expect((await (i % 2 ? carol : bob).post(`/api/auctions/${auction.id}/bids`, { data: { amount: 10 + i } })).status()).toBe(201);
  }
  await bob.dispose();
  await carol.dispose();

  await page.goto(`/auctions/${auction.id}`);
  const history = page.getByTestId('bid-history');
  await expect(history.getByRole('row')).toHaveCount(13);
  await expect(history.getByRole('row').nth(1)).toContainText('$21.00');
  await expect(history.getByTestId('you')).toHaveCount(0);
  await expect(page.getByTestId('price-chart')).toHaveAttribute('data-points', '13');
  expect(await history.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await history.evaluate((el) => el.clientHeight)).toBeLessThanOrEqual(300);
});
