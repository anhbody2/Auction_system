import { expect, request as playwrightRequest, test, type APIRequestContext } from '@playwright/test';
import { PASSWORD, createAuctionViaApi, createGoodsViaApi, uploadImageViaApi } from './helpers';

const TAG = `ll${Date.now().toString(36)}`;

async function apiAs(baseURL: string | undefined, identifier: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL });
  expect((await ctx.post('/api/auth/login', { data: { identifier, password: PASSWORD } })).status()).toBe(200);
  return ctx;
}

test('ui-1b.1: gallery thumbnails, +N lightbox with keyboard, breadcrumb and info card', async ({ page, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const cats = (await (await alice.get('/api/categories')).json()).categories as { id: number; name: string }[];
  const art = cats.find((c) => c.name === 'Art')!;
  const images: string[] = [];
  for (let i = 0; i < 7; i++) images.push(await uploadImageViaApi(alice));
  const goods = await createGoodsViaApi(alice, { name: `Gallery vase ${TAG}`, images, categoryId: art.id, condition: 'new' });
  const auction = await createAuctionViaApi(alice, { name: `Gallery vase ${TAG}`, goodsId: goods.id, description: 'A tall vase with seven photos.' });
  await alice.dispose();

  await page.goto(`/auctions/${auction.id}`);
  const hero = page.getByTestId('gallery-hero');
  await expect(hero).toHaveAttribute('src', images[0]);
  await expect(page.getByRole('img', { name: `Gallery vase ${TAG}`, exact: true })).toHaveAttribute('src', images[0]);

  // Four thumbnails + '+3'; clicking a thumbnail swaps the hero and marks it selected
  const thumbs = page.getByTestId('gallery-thumbs').getByRole('button');
  await expect(thumbs).toHaveCount(5);
  await page.getByRole('button', { name: 'Show image 3' }).click();
  await expect(hero).toHaveAttribute('src', images[2]);
  await expect(page.getByRole('button', { name: 'Show image 3' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Show image 1' })).toHaveAttribute('aria-pressed', 'false');

  // '+3' opens the lightbox at image 5; arrows move and wrap; Escape closes
  await page.getByRole('button', { name: 'Show 3 more images' }).click();
  const box = page.getByTestId('lightbox');
  await expect(box).toBeVisible();
  await expect(page.getByTestId('lightbox-position')).toHaveText('5 / 7');
  await expect(box.getByRole('img')).toHaveAttribute('src', images[4]);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('lightbox-position')).toHaveText('1 / 7');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('lightbox-position')).toHaveText('7 / 7');
  await page.keyboard.press('Escape');
  await expect(box).toHaveCount(0);

  // Info card: pills, name, seller, description, facts
  const info = page.getByTestId('lot-info');
  await expect(info.getByRole('heading', { level: 1 })).toHaveText(`Gallery vase ${TAG}`);
  await expect(info).toContainText('Sold by alice');
  await expect(info).toContainText('No reserve');
  await expect(info).toContainText('A tall vase with seven photos.');
  const facts = page.getByTestId('lot-facts');
  await expect(facts).toContainText('Condition');
  await expect(facts).toContainText('Category');
  await expect(facts).toContainText('Art');
  await expect(page.getByTestId('end-time')).toBeVisible();
  await expect(page.getByTestId('winner')).toHaveCount(0);

  // The bid aside sits in the right column and stays in view while scrolling
  const aside = page.locator('.lot-aside');
  const [heroBox, asideBox] = [await hero.boundingBox(), await aside.boundingBox()];
  expect(asideBox!.x).toBeGreaterThan(heroBox!.x + heroBox!.width - 1);
  expect(await aside.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');

  // Breadcrumb: the category link filters browse
  const crumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumb).toContainText(`Lot #${auction.id}`);
  await crumb.getByRole('link', { name: 'Art' }).click();
  await expect(page).toHaveURL(new RegExp(`/\\?category=${art.id}$`));
  await expect(page.getByTestId('category-chips').getByRole('tab', { name: 'Art', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('ui-1b.1: one-image lot has no thumbnails; reserve lot has no No-reserve pill; 375px is one column', async ({ page, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const auction = await createAuctionViaApi(alice, { name: `Single lamp ${TAG}`, initialPrice: 50, reservePrice: 80 });
  await alice.dispose();
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByTestId('gallery-hero')).toBeVisible();
  await expect(page.getByTestId('gallery-thumbs')).toHaveCount(0);
  await expect(page.getByTestId('lot-info')).not.toContainText('No reserve');
  // One column: gallery, then the bid aside, then the info card
  const [g, a, i] = await Promise.all([page.locator('.lot-gallery'), page.locator('.lot-aside'), page.getByTestId('lot-info')].map((l) => l.boundingBox()));
  expect(a!.y).toBeGreaterThan(g!.y + g!.height - 1);
  expect(i!.y).toBeGreaterThan(a!.y + a!.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('ui-1b.1: goods without images show the placeholder', async ({ page, baseURL }) => {
  const alice = await apiAs(baseURL, 'alice');
  const auction = await createAuctionViaApi(alice, { name: `Bare lamp ${TAG}` });
  await alice.dispose();
  // Images are required on goods; clear them in the view by intercepting the API response.
  await page.route(`**/api/auctions/${auction.id}`, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.auction.goods.images = [];
    await route.fulfill({ response: res, json: body });
  });
  await page.goto(`/auctions/${auction.id}`);
  await expect(page.getByTestId('gallery-placeholder')).toHaveText('No image');
  await expect(page.getByTestId('gallery-hero')).toHaveCount(0);
});
