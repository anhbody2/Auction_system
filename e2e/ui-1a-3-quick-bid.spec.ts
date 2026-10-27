import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login, logout } from './helpers';

const TAG = `qb${Date.now().toString(36)}`;

async function apiAs(baseURL: string | undefined, identifier: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  expect((await ctx.post('/api/auth/login', { data: { identifier, password: PASSWORD } })).status()).toBe(200);
  return ctx;
}


test('ui-1a.3: Bid $X and Custom bid open the lot; seller and guest', async ({ page, baseURL }) => {
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

  // Bid $X opens the lot with the minimum next bid pre-filled; nothing is placed until the lot page form is submitted
  await card.getByTestId('quick-bid').click();
  await expect(page).toHaveURL(new RegExp(`/auctions/${auction.id}$`));
  await expect(page.getByTestId('bid-input')).toHaveValue('10');
  expect(await bids()).toBe(0);
  await page.getByTestId('place-bid').click();
  await expect(page.getByTestId('bid-ok')).toBeVisible();
  expect(await bids()).toBe(1);

  // Back on the list the card shows Leading, the new price and the next amount
  await page.goto(listUrl);
  await expect(card.getByTestId('my-bid-strip')).toHaveAttribute('data-state', 'leading');
  await expect(card).toContainText('Highest bid');
  await expect(card).toContainText('1 bid');
  await expect(card.getByTestId('quick-bid')).toHaveText('Bid $11.00');

  // carol outbids: the card follows on the next load
  const carol = await apiAs(baseURL, 'carol');
  expect((await carol.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 11 } })).status()).toBe(201);
  await carol.dispose();
  await page.goto(listUrl);
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

  // A guest is sent to log in and then lands on the lot
  await page.goto(listUrl);
  await card.getByTestId('quick-bid').click();
  await expect(page).toHaveURL(/\/login\?from=/);
  await page.getByLabel('Username or email').fill('bob');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(new RegExp(`/auctions/${auction.id}$`));
  await expect(page.getByTestId('bid-input')).toHaveValue('12');
});

test('ui-1a.3: upcoming lots have no quick bid buttons', async ({ page, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const upcoming = await createAuctionViaApi(alice, { name: `Later lamp ${TAG}`, startTime: new Date(Date.now() + 60 * 60_000).toISOString() });
  await alice.dispose();
  await login(page, 'bob');
  // home-1.1: upcoming lots are not on the homepage at all, so they never show the buttons there;
  // the lot page offers no bid form until the start.
  await page.goto(`/?q=${TAG}&field=all`);
  await expect(page.getByTestId('section-live')).toBeVisible();
  await expect(page.getByTestId(`auction-card-${upcoming.id}`)).toHaveCount(0);
  await page.goto(`/auctions/${upcoming.id}`);
  await expect(page.getByTestId('countdown').first()).toHaveText(/^Starts in /);
  await expect(page.getByTestId('place-bid')).toHaveCount(0);
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
