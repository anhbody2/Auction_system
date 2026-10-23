import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login, logout } from './helpers';

const TAG = Date.now().toString(36);

async function apiAs(baseURL: string | undefined, identifier: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  expect((await ctx.post('/api/auth/login', { data: { identifier, password: PASSWORD } })).status()).toBe(200);
  return ctx;
}

test('ui-1a.1: browse cards show price, ending-soon pill and the viewer\'s own bid strip', async ({ page, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  // A 1-hour auction is under 60 minutes left a moment after it starts; a 2-hour one is not.
  const soon = await createAuctionViaApi(alice, { name: `Card soon ${TAG}`, initialPrice: 10 });
  const later = await createAuctionViaApi(alice, { name: `Card later ${TAG}`, initialPrice: 10, duration: { value: 2, unit: 'hours' } });
  await alice.dispose();

  // The start job (sys-001) turns the new auctions live.
  const live = page.getByTestId('section-live');
  await expect(async () => {
    await page.goto('/');
    await expect(live.getByTestId(`auction-card-${soon.id}`)).toBeVisible({ timeout: 1000 });
    await expect(live.getByTestId(`auction-card-${later.id}`)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  // Guest: card content, no strip
  const soonCard = live.getByTestId(`auction-card-${soon.id}`);
  const laterCard = live.getByTestId(`auction-card-${later.id}`);
  await expect(soonCard).toContainText('Starting at');
  await expect(soonCard).toContainText('$10.00');
  await expect(soonCard).toContainText('0 bids');
  await expect(soonCard.getByTestId('ending-soon')).toBeVisible();
  await expect(laterCard.getByTestId('ending-soon')).toHaveCount(0);
  await expect(page.getByTestId('my-bid-strip')).toHaveCount(0);

  // bob has not bid -> dashed strip; after his bid -> Leading
  await login(page, 'bob');
  await page.goto('/');
  await expect(soonCard.getByTestId('my-bid-strip')).toHaveAttribute('data-state', 'none');
  await expect(soonCard.getByTestId('my-bid-strip')).toHaveText("You haven't bid yet");
  expect((await page.request.post(`/api/auctions/${soon.id}/bids`, { data: { amount: 10 } })).status()).toBe(201);
  await page.reload();
  await expect(soonCard.getByTestId('my-bid-strip')).toHaveAttribute('data-state', 'leading');
  await expect(soonCard.getByTestId('my-bid-strip')).toContainText('Your bid $10.00');
  await expect(soonCard.getByTestId('my-bid-strip')).toContainText('Leading');
  await expect(soonCard).toContainText('Highest bid');
  await expect(soonCard).toContainText('1 bid');

  // carol outbids -> bob sees Outbid after reload
  const carol = await apiAs(baseURL, 'carol');
  expect((await carol.post(`/api/auctions/${soon.id}/bids`, { data: { amount: 11 } })).status()).toBe(201);
  await carol.dispose();
  await page.reload();
  await expect(soonCard.getByTestId('my-bid-strip')).toHaveAttribute('data-state', 'outbid');
  await expect(soonCard.getByTestId('my-bid-strip')).toContainText('Outbid');
  await expect(soonCard).toContainText('$11.00');

  // The seller sees no strip on her own lots
  await logout(page);
  await login(page, 'alice');
  await expect(page.getByTestId('current-user')).toHaveText('alice');
  await page.goto('/');
  await expect(soonCard).toBeVisible();
  await expect(soonCard.getByTestId('my-bid-strip')).toHaveCount(0);
});

test('ui-1a.1: at 375px the cards are a single column with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const cards = page.getByTestId('section-live').locator('[data-testid^="auction-card-"]');
  await expect(cards.first()).toBeVisible();
  if ((await cards.count()) > 1) {
    const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
    expect(Math.abs(a!.x - b!.x)).toBeLessThan(2);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('ui-1a.1: the live grid has four columns at desktop width and two on a tablet', async ({ page }) => {
  const columns = () => page.getByTestId('section-live').locator('.lot-grid').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('section-live').locator('[data-testid^="auction-card-"]').first()).toBeVisible();
  expect(await columns()).toBe(4);
  await page.setViewportSize({ width: 800, height: 900 });
  await expect.poll(columns).toBe(2);
});
