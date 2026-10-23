import { expect, request as playwrightRequest, test } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login, registerViaApi, staffApi, topUpViaApi } from './helpers';

const TAG = Date.now().toString(36);

test('ui-2a.1: dashboard cards match the Credit page, follow bids and staff approvals live', async ({ page, baseURL }) => {
  const user = `dash_${TAG}`;
  await registerViaApi(page.request, user);
  await login(page, user);
  await topUpViaApi(page.request, 1000);

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: `Welcome back, ${user}` })).toBeVisible();
  await expect(page.getByTestId('dashboard-available')).toHaveText('$1,000.00');
  await expect(page.getByTestId('dashboard-credit')).toHaveText('$1,000.00');
  await expect(page.getByTestId('dashboard-locked')).toHaveText('$0.00');
  await expect(page.getByTestId('dashboard-leading')).toContainText('Held against 0 leading bids');
  await expect(page.getByTestId('dashboard-pending')).toHaveText('$0.00');

  // A bid: locked rises, available drops, the leading count goes up; the bar splits 90 / 10
  const seller = await playwrightRequest.newContext({ baseURL });
  expect((await seller.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  const auction = await createAuctionViaApi(seller, { name: `Dash lot ${TAG}`, initialPrice: 100 });
  await seller.dispose();
  await expect(async () => {
    expect((await page.request.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 100 } })).status()).toBe(201);
  }).toPass({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId('dashboard-locked')).toHaveText('$100.00');
  await expect(page.getByTestId('dashboard-available')).toHaveText('$900.00');
  await expect(page.getByTestId('dashboard-leading')).toContainText('Held against 1 leading bid.');
  const bar = page.getByTestId('credit-bar');
  expect(await bar.locator('.credit-bar-available').evaluate((el) => (el as HTMLElement).style.width)).toBe('90%');
  expect(await bar.locator('.credit-bar-locked').evaluate((el) => (el as HTMLElement).style.width)).toBe('10%');

  // Outbid by bob: released live, leading count back to 0 (no reload)
  const bob = await playwrightRequest.newContext({ baseURL });
  expect((await bob.post('/api/auth/login', { data: { identifier: 'bob', password: PASSWORD } })).status()).toBe(200);
  expect((await bob.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 110 } })).status()).toBe(201);
  await bob.dispose();
  await expect(page.getByTestId('dashboard-locked')).toHaveText('$0.00');
  await expect(page.getByTestId('dashboard-leading')).toContainText('Held against 0 leading bids');

  // A top-up request shows as pending; staff approves it -> pending clears and totals update without reload
  const req = await page.request.post('/api/credit/topup', { data: { amount: 250 } });
  expect(req.status()).toBe(201);
  await page.reload();
  await expect(page.getByTestId('dashboard-pending')).toHaveText('$250.00');
  await page.evaluate(() => ((window as unknown as { __ui2a1: boolean }).__ui2a1 = true));
  const { request: pending } = (await req.json()) as { request: { id: number } };
  expect((await (await staffApi()).post(`/api/staff/credit/requests/${pending.id}/approve`)).status()).toBe(200);
  await expect(page.getByTestId('dashboard-pending')).toHaveText('$0.00');
  await expect(page.getByTestId('dashboard-credit')).toHaveText('$1,250.00');
  await expect(page.getByTestId('dashboard-available')).toHaveText('$1,250.00');
  expect(await page.evaluate(() => (window as unknown as { __ui2a1?: boolean }).__ui2a1)).toBe(true);

  // Values match the Credit page
  await page.goto('/credit');
  await expect(page.getByTestId('credit-balance')).toHaveText('$1,250.00');
  await expect(page.getByTestId('credit-held')).toHaveText('$0.00');

  // Buttons open the Credit page on the matching tab
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Add credit' }).click();
  await expect(page).toHaveURL(/\/credit\?mode=topup$/);
  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Withdraw' }).click();
  await expect(page).toHaveURL(/\/credit\?mode=withdraw$/);
});

test('ui-2a.1: first name greeting, empty bar without credit, 375px single column', async ({ page }) => {
  const user = `dash0_${TAG}`;
  await registerViaApi(page.request, user);
  // registerViaApi sets the full name to '<username> Test'
  await login(page, user);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: `Welcome back, ${user}` })).toBeVisible();
  expect(await page.getByTestId('credit-bar').locator('.credit-bar-available').evaluate((el) => (el as HTMLElement).style.width)).toBe('0%');
  const cards = page.locator('.dash-cards > .ui-card');
  await expect(cards).toHaveCount(3);
  const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
