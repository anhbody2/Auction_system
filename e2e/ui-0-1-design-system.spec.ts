import { expect, request as playwrightRequest, test } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login, logout, openRoleNav } from './helpers';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

test('ui-0.1: guest top bar has the brand and Browse, no bid limit or avatar', async ({ page }) => {
  await page.goto('/');
  const bar = page.locator('header.topbar');
  await expect(bar.getByRole('link', { name: "Beat'em home" })).toBeVisible();
  await expect(bar.locator('nav').getByRole('link', { name: 'Browse' })).toHaveClass(/active/);
  await expect(page.getByTestId('bid-limit')).toHaveCount(0);
  await expect(page.getByTestId('avatar')).toHaveCount(0);
  await expect(bar.getByRole('link', { name: 'Log in' })).toBeVisible();
  // Mulish is the first font in the stack.
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"?Mulish/);
});

test('ui-0.1: customer top bar shows bid limit = credit - locked (live), initials avatar and a menu that logs out', async ({ page, baseURL }) => {
  await login(page, 'carol');
  const nav = page.locator('header nav');
  for (const name of ['Browse', 'Dashboard', 'Bids', 'Credit', 'My goods', 'My Auctions']) {
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveClass(/active/);

  const me = async () => ((await (await page.request.get('/api/auth/me')).json()) as { user: { creditBalance: number; heldBalance: number; fullName: string } }).user;
  const before = await me();
  await expect(page.getByTestId('bid-limit')).toHaveText(money(before.creditBalance - before.heldBalance));

  // Other specs rename carol, so the expected initials come from her current full name.
  const [first, second] = before.fullName.trim().split(/\s+/);
  await expect(page.getByTestId('avatar')).toHaveText((first[0] + (second ? second[0] : first[1] ?? '')).toUpperCase());
  await expect(page.getByTestId('user-menu')).toBeHidden();
  await page.getByTestId('avatar').click();
  await expect(page.getByTestId('user-menu')).toBeVisible();
  await expect(page.getByTestId('header-credit')).toHaveText(money(before.creditBalance));
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('user-menu')).toBeHidden();

  // A bid locks credit; being outbid releases it without a reload (crd-003 events).
  const seller = await playwrightRequest.newContext({ baseURL });
  expect((await seller.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  const auction = await createAuctionViaApi(seller, { name: `ui-0.1 lot ${Date.now()}`, initialPrice: 20 });
  await seller.dispose();
  expect((await page.request.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 20 } })).status()).toBe(201);
  await page.reload();
  const available = before.creditBalance - before.heldBalance;
  await expect(page.getByTestId('bid-limit')).toHaveText(money(available - 20));
  const rival = await playwrightRequest.newContext({ baseURL });
  expect((await rival.post('/api/auth/login', { data: { identifier: 'bob', password: PASSWORD } })).status()).toBe(200);
  expect((await rival.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 30 } })).status()).toBe(201);
  await rival.dispose();
  await expect(page.getByTestId('bid-limit')).toHaveText(money(available));

  await logout(page);
  await expect(page.getByTestId('avatar')).toHaveCount(0);
});

test('ui-0.1: staff keep their links and role pill, no bid limit', async ({ page }) => {
  await login(page, 'staff');
  const nav = page.locator('header nav');
  await openRoleNav(page);
  await expect(nav.getByRole('link', { name: 'Statistics' })).toBeVisible();
  await expect(nav.getByRole('link', { name: /^Goods/ })).toBeVisible();
  await expect(nav.getByRole('link', { name: /^Credit management/ })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Bids', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('current-role')).toHaveText('staff');
  await expect(page.getByTestId('bid-limit')).toHaveCount(0);
  await expect(page.getByTestId('avatar')).toHaveText('SS');
});

test('ui-0.1: at 375px the nav folds behind a menu button and nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  // The username is hidden next to the avatar at this width, so wait for the avatar instead of login().
  await page.goto('/login');
  await page.getByLabel('Username or email').fill('carol');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('avatar')).toBeVisible();
  const nav = page.locator('header nav');
  await expect(nav).toBeHidden();
  await expect(page.getByTestId('bid-limit')).toBeVisible();
  await page.getByTestId('nav-toggle').click();
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: 'Credit', exact: true }).click();
  await expect(page).toHaveURL(/\/credit$/);
  await expect(nav).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
