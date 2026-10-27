import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login } from './helpers';

const TAG = `fx${Date.now().toString(36)}`;
const liveNames = (page: Page) => page.getByTestId('section-live').locator('[data-testid^="auction-card-"] h3').allTextContents();
const mine = (names: string[]) => names.filter((n) => n.includes(TAG));

test('ui-1a.2: category chips, sort, URL state, Back and clear filters', async ({ page, baseURL }) => {
  const alice = await playwrightRequest.newContext({ baseURL });
  expect((await alice.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  const cats = (await (await alice.get('/api/categories')).json()).categories as { id: number; name: string }[];
  const art = cats.find((c) => c.name === 'Art')!;
  const fashion = cats.find((c) => c.name === 'Fashion')!;
  const day = { value: 1, unit: 'days' };
  await createAuctionViaApi(alice, { name: `Cheap print ${TAG}`, initialPrice: 15, categoryId: art.id, duration: day });
  await createAuctionViaApi(alice, { name: `Dear canvas ${TAG}`, initialPrice: 900, categoryId: art.id, duration: day });
  await createAuctionViaApi(alice, { name: `Mid scarf ${TAG}`, initialPrice: 60, categoryId: fashion.id, duration: day });
  await alice.dispose();

  // Narrow to this test's lots with the top bar search, then wait for the start job to make them live.
  await page.goto('/');
  await page.getByLabel('Keywords').fill(TAG);
  // The top bar has no Search button any more (card restyle): Enter submits.
  await page.getByLabel('Keywords').press('Enter');
  await expect(page).toHaveURL(new RegExp(`\\?q=${TAG}&field=all$`));
  await expect(async () => {
    await page.reload();
    expect(mine(await liveNames(page))).toHaveLength(3);
  }).toPass({ timeout: 15_000 });

  // Category chip: only Art lots; the chip is selected and the URL keeps it
  const chips = page.getByTestId('category-chips');
  await expect(chips.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true');
  await chips.getByRole('tab', { name: 'Art', exact: true }).click();
  await expect(chips.getByRole('tab', { name: 'Art', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(new RegExp(`category=${art.id}`));
  await expect.poll(async () => mine(await liveNames(page)).sort()).toEqual([`Cheap print ${TAG}`, `Dear canvas ${TAG}`]);

  // Sort by price both ways
  await page.getByTestId('sort').selectOption({ label: 'Price: high to low' });
  await expect(page).toHaveURL(/sort=price_desc/);
  await expect.poll(async () => mine(await liveNames(page))).toEqual([`Dear canvas ${TAG}`, `Cheap print ${TAG}`]);
  await page.getByTestId('sort').selectOption({ label: 'Price: low to high' });
  await expect.poll(async () => mine(await liveNames(page))).toEqual([`Cheap print ${TAG}`, `Dear canvas ${TAG}`]);

  // Reload keeps chip, sort and search
  await page.reload();
  await expect(chips.getByRole('tab', { name: 'Art', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('sort')).toHaveValue('price_asc');
  await expect(page.getByLabel('Keywords')).toHaveValue(TAG);
  await expect.poll(async () => mine(await liveNames(page))).toEqual([`Cheap print ${TAG}`, `Dear canvas ${TAG}`]);

  // Back restores the previous state (price high to low)
  await page.goBack();
  await expect(page.getByTestId('sort')).toHaveValue('price_desc');
  await expect.poll(async () => mine(await liveNames(page))).toEqual([`Dear canvas ${TAG}`, `Cheap print ${TAG}`]);

  // Searching again from the top bar keeps the chip and sort
  await page.getByLabel('Keywords').fill(`canvas ${TAG}`);
  await page.getByLabel('Search in').selectOption({ label: 'Auction' });
  // The top bar has no Search button any more (card restyle): Enter submits.
  await page.getByLabel('Keywords').press('Enter');
  await expect(page).toHaveURL(new RegExp(`category=${art.id}`));
  await expect.poll(async () => mine(await liveNames(page))).toEqual([`Dear canvas ${TAG}`]);

  // A chip with no match -> 'No lots match.' and Clear filters resets everything
  await chips.getByRole('tab', { name: 'Fashion', exact: true }).click();
  await expect(page.getByTestId('no-match')).toContainText('No lots match.');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('no-match')).toHaveCount(0);
  await expect(chips.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Keywords')).toHaveValue('');
});

test('ui-1a.2: Ending soon chip lists only live lots ending within the hour', async ({ page, baseURL }) => {
  const alice = await playwrightRequest.newContext({ baseURL });
  expect((await alice.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  const soon = await createAuctionViaApi(alice, { name: `Soon lot ${TAG}` });
  const later = await createAuctionViaApi(alice, { name: `Later lot ${TAG}`, duration: { value: 2, unit: 'hours' } });
  await alice.dispose();
  await page.goto(`/?category=ending`);
  await expect(page.getByTestId('category-chips').getByRole('tab', { name: 'Ending soon' })).toHaveAttribute('aria-selected', 'true');
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId(`auction-card-${soon.id}`)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId(`auction-card-${later.id}`)).toHaveCount(0);
  await expect(page.getByTestId('section-completed').locator('[data-testid^="auction-card-"]')).toHaveCount(0);
});

test('ui-1a.2: at 375px the chips scroll inside their bar, the page does not', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const bar = page.locator('.chip-bar');
  await expect(page.getByTestId('category-chips').getByRole('tab').nth(3)).toBeAttached();
  expect(await bar.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await expect(page.getByLabel('Keywords')).toBeVisible();
});

test('ui-1a.2: the top bar fits at 1280px for customers and admins', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const who of ['carol', 'admin']) {
    await page.context().clearCookies();
    await login(page, who);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), who).toBeLessThanOrEqual(1280);
    const bar = page.locator('header.topbar');
    expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth), who).toBe(true);
  }
});
