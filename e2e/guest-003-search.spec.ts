import { expect, test, type Page } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi } from './helpers';

// Unique words so other specs' auctions sharing this DB can't match.
const TAG = `zq${Date.now().toString(36)}`;

async function search(page: Page, q: string, field: string) {
  await page.getByLabel('Keywords').fill(q);
  await page.getByLabel('Search in').selectOption({ label: field });
  await page.getByRole('button', { name: 'Search', exact: true }).click();
}

const resultNames = (page: Page) => page.locator('[data-testid^="auction-card-"] h3').allTextContents();

test('guest-003: guest searches by seller, auction, category and product', async ({ page }) => {
  const seller = `kim${TAG}`;
  await registerViaApi(page.request, seller);
  await login(page, seller);
  const cats = (await (await page.request.get('/api/categories')).json()).categories as { id: number; name: string }[];
  const art = cats.find((c) => c.name === 'Art')!.id;
  const fashion = cats.find((c) => c.name === 'Fashion')!.id;
  await createAuctionViaApi(page.request, { name: `Watercolor ${TAG}`, description: 'Original painting on paper.', categoryId: art });
  await createAuctionViaApi(page.request, { name: `Silk scarf ${TAG}`, description: 'Hand-printed silk, never worn.', categoryId: fashion });
  const done = await createAuctionViaApi(page.request, { name: `Oil portrait ${TAG}`, description: 'Framed painting.', categoryId: art });
  await page.request.post(`/api/dev/auctions/${done.id}/expire`);
  await logout(page);

  // Guest toggles search tools
  await page.goto('/');
  await expect(page.getByLabel('Keywords')).toHaveCount(0);
  await page.getByRole('button', { name: 'Search auctions' }).click();
  await expect(page.getByLabel('Keywords')).toBeVisible();
  await expect(page.getByLabel('Search in').locator('option')).toHaveText(['Everything', 'Seller name', 'Auction', 'Category', 'Product']);

  // Seller name: all 3 (available + just completed)
  await search(page, seller, 'Seller name');
  await expect(page.getByTestId('search-summary')).toContainText('3 results');
  expect((await resultNames(page)).sort()).toEqual([`Oil portrait ${TAG}`, `Silk scarf ${TAG}`, `Watercolor ${TAG}`]);
  await expect(page.getByTestId('section-completed')).toContainText(`Oil portrait ${TAG}`);

  // Auction name
  await search(page, `scarf ${TAG}`, 'Auction');
  await expect(page.getByTestId('search-summary')).toContainText('1 result');
  expect(await resultNames(page)).toEqual([`Silk scarf ${TAG}`]);

  // Category (combined with tag via product search below); category alone matches every Art auction
  await search(page, 'Art', 'Category');
  await expect(page.getByTestId('search-summary')).toBeVisible();
  const artNames = await resultNames(page);
  expect(artNames).toEqual(expect.arrayContaining([`Watercolor ${TAG}`, `Oil portrait ${TAG}`]));
  expect(artNames).not.toContain(`Silk scarf ${TAG}`);

  // Product (goods name / description)
  await search(page, TAG, 'Product');
  await expect(page.getByTestId('search-summary')).toContainText('3 results');
  await search(page, 'hand-printed', 'Product');
  expect(await resultNames(page)).toContain(`Silk scarf ${TAG}`);
  expect(await resultNames(page)).not.toContain(`Watercolor ${TAG}`);

  // No match
  await search(page, `${TAG}-nothing`, 'Everything');
  await expect(page.getByTestId('search-summary')).toContainText('0 results');
  await expect(page.getByText('No live auctions match.')).toBeVisible();

  // Clear restores the full listing
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByTestId('search-summary')).toHaveCount(0);
  await expect(page.getByTestId('section-live')).toContainText(`Watercolor ${TAG}`);
});
