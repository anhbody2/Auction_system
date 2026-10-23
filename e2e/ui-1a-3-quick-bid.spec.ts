import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login, logout } from './helpers';

const TAG = `qb${Date.now().toString(36)}`;

async function apiAs(baseURL: string | undefined, identifier: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  expect((await ctx.post('/api/auth/login', { data: { identifier, password: PASSWORD } })).status()).toBe(200);
  return ctx;
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const bidLimit = async (page: Page) => Number((await page.getByTestId('bid-limit').textContent())!.replace(/[$,]/g, ''));

test('ui-1a.3: quick bid with confirm, cancel, stale price, seller and guest', async ({ page, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const auction = await createAuctionViaApi(alice, { name: `Quick lamp ${TAG}`, initialPrice: 10 });
  await alice.dispose();
  const listUrl = `/?q=${TAG}&field=all`;
  const card = page.getByTestId(`auction-card-${auction.id}`);
  const bids = async () => ((await (await page.request.get(`/api/auctions/${auction.id}/bids`)).json()) as { bids: unknown[] }).bids.length;

  await login(page, 'bob');
  await expect(async () => {
    await page.goto(listUrl);
    await expect(page.getByTestId('section-live').getByTestId(`auction-card-${auction.id}`)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(card.getByTestId('quick-bid')).toHaveText('Bid $10.00');

  // Cancel and Escape place nothing
  await card.getByTestId('quick-bid').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`Place a binding bid of $10.00 on Quick lamp ${TAG}?`);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await card.getByTestId('quick-bid').click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await bids()).toBe(0);

  // Confirm: bid placed without leaving the page; card, strip and bid limit update
  const limitBefore = await bidLimit(page);
  await card.getByTestId('quick-bid').click();
  await dialog.getByRole('button', { name: 'Bid $10.00' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Bid of $10.00 placed on Quick lamp ${TAG}` })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`\\?q=${TAG}`));
  await expect(card.getByTestId('my-bid-strip')).toHaveAttribute('data-state', 'leading');
  await expect(card).toContainText('Highest bid');
  await expect(card).toContainText('1 bid');
  await expect(card.getByTestId('quick-bid')).toHaveText('Bid $11.00');
  await expect(page.getByTestId('bid-limit')).toHaveText(money(limitBefore - 10));
  expect(await bids()).toBe(1);

  // Price moved: carol bids $11 elsewhere; bob's card still offers $11 -> server refuses, card refreshes to $12
  const carol = await apiAs(baseURL, 'carol');
  expect((await carol.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 11 } })).status()).toBe(201);
  await carol.dispose();
  await card.getByTestId('quick-bid').click();
  await dialog.getByRole('button', { name: 'Bid $11.00' }).click();
  await expect(page.locator('.toast-error')).toBeVisible();
  await expect(card.getByTestId('quick-bid')).toHaveText('Bid $12.00');
  await expect(card.getByTestId('my-bid-strip')).toHaveAttribute('data-state', 'outbid');
  expect(await bids()).toBe(2);

  // Custom bid opens the lot with the bid input focused
  await card.getByTestId('custom-bid').click();
  await expect(page).toHaveURL(new RegExp(`/auctions/${auction.id}\\?bid=1$`));
  await expect(page.getByLabel('Your bid')).toBeFocused();

  // The seller sees no buttons on her own lot
  await logout(page);
  await login(page, 'alice');
  await expect(page.getByTestId('current-user')).toHaveText('alice');
  await page.goto(listUrl);
  await expect(card).toBeVisible();
  await expect(card.getByTestId('quick-bid')).toHaveCount(0);
  await expect(card.getByTestId('custom-bid')).toHaveCount(0);
  await logout(page);

  // A guest is sent to log in and comes back to the same list
  await page.goto(listUrl);
  await card.getByTestId('quick-bid').click();
  await expect(page).toHaveURL(/\/login\?from=/);
  await page.getByLabel('Username or email').fill('bob');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?q=${TAG}&field=all$`));
  await expect(card.getByTestId('quick-bid')).toHaveText('Bid $12.00');
});

test('ui-1a.3: upcoming lots have no quick bid buttons', async ({ page, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const upcoming = await createAuctionViaApi(alice, { name: `Later lamp ${TAG}`, startTime: new Date(Date.now() + 60 * 60_000).toISOString() });
  await alice.dispose();
  await login(page, 'bob');
  await page.goto(`/?q=${TAG}&field=all`);
  const card = page.getByTestId('section-upcoming').getByTestId(`auction-card-${upcoming.id}`);
  await expect(card).toBeVisible();
  await expect(card.getByTestId('quick-bid')).toHaveCount(0);
});

test('ui-1a.3: at 375px the card buttons fit without sideways scroll', async ({ page, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const lot = await createAuctionViaApi(alice, { name: `Narrow lamp ${TAG}` });
  await alice.dispose();
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(async () => {
    await page.goto(`/?q=Narrow%20lamp%20${TAG}&field=auction`);
    await expect(page.getByTestId(`auction-card-${lot.id}`).getByTestId('quick-bid')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
