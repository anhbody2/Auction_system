import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, createSoldAuction, login, logout } from './helpers';

const TAG = `da${Date.now().toString(36)}`;

async function apiAs(baseURL: string | undefined, identifier: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  expect((await ctx.post('/api/auth/login', { data: { identifier, password: PASSWORD } })).status()).toBe(200);
  return ctx;
}

test('ui-2a.3: Bidding shows Leading then Outbid with Rebid; Selling lists own lots; tab kept in the URL', async ({ page, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const lot = await createAuctionViaApi(alice, { name: `Dash bid ${TAG}`, initialPrice: 10 });
  await alice.dispose();

  await login(page, 'bob');
  await expect(async () => {
    expect((await page.request.post(`/api/auctions/${lot.id}/bids`, { data: { amount: 10 } })).status()).toBe(201);
  }).toPass({ timeout: 15_000 });
  await page.goto('/dashboard');
  const card = page.getByTestId('my-auctions-card');
  const tabs = page.getByTestId('my-auctions-tabs');
  await expect(tabs.getByRole('tab', { name: /^Bidding · \d+$/ })).toHaveAttribute('aria-selected', 'true');
  const row = card.getByTestId(`row-${lot.id}`);
  await expect(row).toContainText(`Dash bid ${TAG}`);
  await expect(row).toContainText('$10.00');
  await expect(row.getByTestId('standing')).toHaveText('Leading');
  await expect(row.getByTestId('countdown')).toHaveText(/left$/);

  // carol outbids: the row turns to Outbid · Rebid (bob's locked credit drops, which reloads the card)
  const carol = await apiAs(baseURL, 'carol');
  expect((await carol.post(`/api/auctions/${lot.id}/bids`, { data: { amount: 11 } })).status()).toBe(201);
  await carol.dispose();
  await expect(row.getByTestId('standing')).toHaveText('Outbid · Rebid');
  await expect(row).toContainText('$11.00');
  await row.getByTestId('standing').click();
  await expect(page).toHaveURL(new RegExp(`/auctions/${lot.id}\\?bid=1$`));
  await expect(page.getByTestId('bid-input')).toBeFocused();

  // Selling: bob's own live listing; the tab is kept in ?tab= across a reload
  const own = await createAuctionViaApi(page.request, { name: `Dash sell ${TAG}`, initialPrice: 25 });
  await page.goto('/dashboard');
  await tabs.getByRole('tab', { name: /^Selling/ }).click();
  await expect(page).toHaveURL(/\?tab=selling$/);
  await page.reload();
  await expect(tabs.getByRole('tab', { name: /^Selling/ })).toHaveAttribute('aria-selected', 'true');
  const sellRow = card.getByTestId(`row-${own.id}`);
  await expect(sellRow).toContainText(`Dash sell ${TAG}`);
  await expect(sellRow).toContainText('Starts $25.00');
  await expect(card.getByTestId(`row-${lot.id}`)).toHaveCount(0);
});

test('ui-2a.3: Ended shows the result from both sides (bidder Won, seller Sold); 375px table scrolls inside', async ({ page }) => {
  // alice sells, bob wins at $150, settled
  const sold = await createSoldAuction(page.request, `Dash ended ${TAG}`);

  await login(page, 'bob');
  await page.goto('/dashboard?tab=ended');
  const card = page.getByTestId('my-auctions-card');
  await expect(page.getByTestId('my-auctions-tabs').getByRole('tab', { name: /^Ended/ })).toHaveAttribute('aria-selected', 'true');
  const row = card.getByTestId(`row-${sold.id}`);
  await expect(row.getByTestId('result')).toHaveText('Won');
  await expect(row).toContainText('$150.00');
  // Newest ended first
  await expect(card.locator('tbody tr').first()).toHaveAttribute('data-testid', `row-${sold.id}`);
  await logout(page);

  await login(page, 'alice');
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/dashboard?tab=ended');
  await expect(card.getByTestId(`row-${sold.id}`).getByTestId('result')).toHaveText('Sold');
  await expect(card.getByTestId(`row-${sold.id}`)).toContainText('Your lot');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
