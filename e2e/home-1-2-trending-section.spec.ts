import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login } from './helpers';

const TAG = `ts${Date.now().toString(36)}`;
const cardIds = (page: Page) =>
  page.getByTestId('section-live').locator('[data-testid^="auction-card-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));

test('home-1.2: one Trending lots section, most bids first, the same for guests and customers', async ({ page, baseURL }) => {
  const alice = await playwrightRequest.newContext({ baseURL });
  expect((await alice.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  const quiet = await createAuctionViaApi(alice, { name: `Quiet bowl ${TAG}`, initialPrice: 10 });
  const busy = await createAuctionViaApi(alice, { name: `Busy bowl ${TAG}`, initialPrice: 10, duration: { value: 2, unit: 'hours' } });
  const later = await createAuctionViaApi(alice, { name: `Later bowl ${TAG}`, startTime: new Date(Date.now() + 60 * 60_000).toISOString() });
  await alice.dispose();
  const bob = await playwrightRequest.newContext({ baseURL });
  expect((await bob.post('/api/auth/login', { data: { identifier: 'bob', password: PASSWORD } })).status()).toBe(200);
  expect((await bob.post(`/api/auctions/${busy.id}/bids`, { data: { amount: 10 } })).status()).toBe(201);
  await bob.dispose();

  const listUrl = `/?q=${TAG}&field=auction`;
  for (const who of ['guest', 'carol']) {
    if (who !== 'guest') await login(page, who);
    await page.goto(listUrl);
    const live = page.getByTestId('section-live');
    await expect(live.getByRole('heading', { name: 'Trending lots' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Find something worth bidding on' })).toHaveCount(0);
    await expect(page.getByTestId('section-upcoming')).toHaveCount(0);
    await expect(live.getByTestId('live-count')).toHaveText('2 live auctions');
    await expect(page.getByText('bids update in real time')).toHaveCount(0);
    await expect(page.getByTestId('sort').locator('option:checked')).toHaveText('Most bids');
    await expect.poll(() => cardIds(page), { message: who }).toEqual([`auction-card-${busy.id}`, `auction-card-${quiet.id}`]);
    await expect(page.getByTestId(`auction-card-${later.id}`)).toHaveCount(0);
    const card = live.getByTestId(`auction-card-${busy.id}`);
    await expect(card).toContainText('Highest bid');
    await expect(card).toContainText('1 bid');
    await expect(card.getByTestId('quick-bid')).toBeVisible();
    await expect(card.getByTestId('custom-bid')).toBeVisible();
    if (who === 'guest') await expect(live.getByTestId('my-bid-strip')).toHaveCount(0);
    else await expect(card.getByTestId('my-bid-strip')).toHaveAttribute('data-state', 'none');
  }

  // The sort is kept in the URL; Ending soon puts the quiet lot (ends first) on top.
  await page.getByTestId('sort').selectOption({ label: 'Ending soon' });
  await expect(page).toHaveURL(/sort=ending/);
  await expect.poll(() => cardIds(page)).toEqual([`auction-card-${quiet.id}`, `auction-card-${busy.id}`]);
  await page.reload();
  await expect(page.getByTestId('sort')).toHaveValue('ending');

  // No match in the trending section
  await page.goto(`/?q=${TAG}-nothing&field=auction`);
  await expect(page.getByTestId('section-live')).toContainText('No live auctions match.');
});

test('home-1.2: four columns at 1440px, one column at 375px with no sideways scroll', async ({ page, baseURL }) => {
  const alice = await playwrightRequest.newContext({ baseURL });
  expect((await alice.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  const a = await createAuctionViaApi(alice, { name: `Grid cup ${TAG}` });
  const b = await createAuctionViaApi(alice, { name: `Grid mug ${TAG}` });
  await alice.dispose();
  const grid = page.getByTestId('section-live').locator('.lot-grid');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?q=Grid&field=auction`);
  await expect(page.getByTestId(`auction-card-${b.id}`)).toBeVisible();
  expect(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(4);

  await page.setViewportSize({ width: 375, height: 800 });
  const [ca, cb] = [await page.getByTestId(`auction-card-${a.id}`).boundingBox(), await page.getByTestId(`auction-card-${b.id}`).boundingBox()];
  expect(Math.abs(ca!.x - cb!.x)).toBeLessThan(2);
  expect(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(page.getByRole('heading', { name: 'Trending lots' })).toBeVisible();
});
