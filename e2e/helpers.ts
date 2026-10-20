import { expect, type APIRequestContext, type Page } from '@playwright/test';
import sharp from 'sharp';

export const PASSWORD = 'Password123!';

export async function login(page: Page, identifier: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByTestId('current-user')).toBeVisible();
}

/** Creates a fresh account through the API (so tests that mutate credentials don't touch seed users). */
export async function registerViaApi(request: APIRequestContext, username: string, password = PASSWORD) {
  const res = await request.post('/api/auth/register', {
    data: {
      fullName: `${username} Test`,
      username,
      email: `${username}@example.com`,
      phone: '0900000000',
      password,
      confirmPassword: password,
    },
  });
  expect(res.status()).toBe(201);
}

/** Creates an auction via the API using the page's logged-in session. */
/**
 * Creates an auction as the signed-in user. Without a goodsId it first adds goods (one uploaded image) named
 * like the auction; categoryId and condition overrides go to those goods (sell-003).
 */
export async function createAuctionViaApi(request: APIRequestContext, overrides: Record<string, unknown> = {}) {
  const { categoryId, condition, ...auctionFields } = overrides;
  const name = (auctionFields.name as string | undefined) ?? 'E2E Item';
  const description = (auctionFields.description as string | undefined) ?? 'An item created by the e2e suite.';
  const goodsId =
    auctionFields.goodsId ??
    (await createGoodsViaApi(request, { name, description, ...(categoryId ? { categoryId } : {}), ...(condition ? { condition } : {}) })).id;
  const res = await request.post('/api/auctions', {
    data: {
      name,
      description,
      initialPrice: 100,
      startTime: new Date().toISOString(),
      duration: { value: 1, unit: 'hours' },
      ...auctionFields,
      goodsId,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).auction as { id: number; name: string };
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** alice sells, bob wins at $150 (5% commission = $7.50); the auction is expired and settled. */
export async function createSoldAuction(request: APIRequestContext, name: string) {
  await request.post('/api/auth/login', { data: { identifier: 'alice', password: PASSWORD } });
  const auction = await createAuctionViaApi(request, { name, initialPrice: 100 });
  await request.post('/api/auth/login', { data: { identifier: 'bob', password: PASSWORD } });
  // Other specs spend bob's credit; top up so this helper works at any point in the suite.
  expect((await request.post('/api/credit/topup', { data: { amount: 150 } })).ok()).toBe(true);
  expect((await request.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 150 } })).status()).toBe(201);
  await request.post(`/api/dev/auctions/${auction.id}/expire`);
  await expect
    .poll(async () => (await (await request.get(`/api/dev/auctions/${auction.id}/raw`)).json()).status)
    .toBe('ended');
  await request.post('/api/auth/logout');
  return auction;
}

/** A small solid-colour PNG for upload tests. */
export const testPng = (width = 320, height = 240, background = '#2a9d8f') =>
  sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();

/** Uploads a test image as the signed-in user of `request` and returns its /uploads URL. */
export async function uploadImageViaApi(request: APIRequestContext) {
  const res = await request.post('/api/uploads', { multipart: { image: { name: 'item.png', mimeType: 'image/png', buffer: await testPng() } } });
  expect(res.status()).toBe(201);
  return (await res.json()).url as string;
}

/** Adds goods with one uploaded image as the signed-in user (gds-001). */
export async function createGoodsViaApi(request: APIRequestContext, overrides: Record<string, unknown> = {}) {
  const categories = (await (await request.get('/api/categories')).json()).categories;
  const res = await request.post('/api/goods', {
    data: {
      name: 'E2E Goods',
      description: 'Goods created by the e2e suite.',
      categoryId: categories[0].id,
      condition: 'used',
      images: [await uploadImageViaApi(request)],
      ...overrides,
    },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).goods as { id: number; name: string; images: string[]; status: string };
}
