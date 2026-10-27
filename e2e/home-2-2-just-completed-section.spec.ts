import { expect, request as playwrightRequest, test, type Page } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, login } from './helpers';

const TAG = `jp${Date.now().toString(36)}`;
const doneCards = (page: Page) => page.getByTestId('section-completed').locator('[data-testid^="auction-card-"]');

test('home-2.2: Just completed shows the 8 newest closed lots in the ended card style', async ({ page, baseURL }) => {
  const alice = await playwrightRequest.newContext({ baseURL });
  expect((await alice.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } })).status()).toBe(200);
  const bob = await playwrightRequest.newContext({ baseURL });
  expect((await bob.post('/api/auth/login', { data: { identifier: 'bob', password: PASSWORD } })).status()).toBe(200);
  const expired: number[] = [];
  for (let i = 1; i <= 9; i++) {
    const lot = await createAuctionViaApi(alice, { name: `Done plate ${i} ${TAG}`, initialPrice: 20 });
    // The newest one is won by bob.
    if (i === 9) expect((await bob.post(`/api/auctions/${lot.id}/bids`, { data: { amount: 20 } })).status()).toBe(201);
    expect((await alice.post(`/api/dev/auctions/${lot.id}/expire`)).status()).toBe(200);
    expired.push(lot.id);
  }
  await alice.dispose();
  await bob.dispose();
  const won = expired[8];

  // Workers: 1, so these 9 are the newest closed lots in the e2e database.
  for (const who of ['guest', 'carol']) {
    if (who !== 'guest') await login(page, who);
    await page.goto('/');
    const section = page.getByTestId('section-completed');
    await expect(section.getByRole('heading', { name: /^Just completed/ })).toHaveText('Just completed (8)');
    await expect(section).not.toContainText('last 7 days');
    await expect(doneCards(page)).toHaveCount(8);
    expect(await doneCards(page).evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-testid')!.split('-').pop()))), who).toEqual(
      expired.slice(1).reverse(),
    );
    await expect(section.getByTestId(`auction-card-${expired[0]}`)).toHaveCount(0);

    const wonCard = section.getByTestId(`auction-card-${won}`);
    await expect(wonCard.getByTestId('countdown')).toHaveText(/^Ended /);
    await expect(wonCard).toContainText('Winning bid');
    await expect(wonCard).toContainText('$20.00');
    await expect(wonCard).toContainText('1 bid');
    await expect(wonCard.getByTestId('card-winner')).toHaveText('Won by bob');
    const unsold = section.getByTestId(`auction-card-${expired[1]}`);
    await expect(unsold).toContainText('Final price');
    await expect(unsold.getByTestId('card-winner')).toHaveText('No winner');
    await expect(section.getByTestId('quick-bid')).toHaveCount(0);
    await expect(section.getByTestId('custom-bid')).toHaveCount(0);
    await expect(section.getByTestId('my-bid-strip')).toHaveCount(0);
  }

  // A completed card opens the lot in view-only mode.
  await page.getByTestId('section-completed').getByTestId(`auction-card-${won}`).getByRole('link').click();
  await expect(page.getByText('This auction has ended and no longer accepts bids.')).toBeVisible();

  // Filtered with no match
  await page.goto(`/?q=${TAG}-nothing&field=auction`);
  await expect(page.getByTestId('section-completed')).toContainText('No completed auctions match.');
});

test('home-2.2: at 375px the completed grid is one column with no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const cards = doneCards(page);
  await expect(cards.nth(1)).toBeVisible();
  const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(Math.abs(a!.x - b!.x)).toBeLessThan(2);
  expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
