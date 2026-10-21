import { expect, request as playwrightRequest, type APIRequestContext, type Page } from '@playwright/test';
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
  await topUpViaApi(request, 150);
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

let staffContext: Promise<APIRequestContext> | null = null;
/** A separate API session signed in as the seeded staff user (stf-005 approvals). */
export function staffApi() {
  staffContext ??= (async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: 'http://localhost:5180' });
    const res = await ctx.post('/api/auth/login', { data: { identifier: 'staff', password: PASSWORD } });
    expect(res.status()).toBe(200);
    return ctx;
  })();
  return staffContext;
}

/**
 * stf-007: top-ups are requests. Asks for one as the signed-in user of `request`, then the seeded staff user
 * approves it through the real staff route. Returns the approved (posted) ledger row.
 */
export async function topUpViaApi(request: APIRequestContext, amount: number) {
  const res = await request.post('/api/credit/topup', { data: { amount } });
  expect(res.status(), await res.text()).toBe(201);
  const { request: pending } = (await res.json()) as { request: { id: number } };
  const approved = await (await staffApi()).post(`/api/staff/credit/requests/${pending.id}/approve`);
  expect(approved.status(), await approved.text()).toBe(200);
  return (await approved.json()).transaction as { id: number; amount: number; status: string };
}

/** Staff approves pending goods through the real staff route (stf-005). */
export async function approveGoodsViaApi(goodsId: number) {
  const res = await (await staffApi()).post(`/api/staff/goods/${goodsId}/approve`);
  expect(res.status(), await res.text()).toBe(200);
}

/**
 * Adds goods with one uploaded image as the signed-in user (gds-001). Customer goods start pending (stf-005);
 * staff approves them unless `approve: false`.
 */
export async function createGoodsViaApi(request: APIRequestContext, overrides: Record<string, unknown> = {}, { approve = true } = {}) {
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
  const goods = (await res.json()).goods as { id: number; name: string; images: string[]; status: string };
  if (approve) {
    await approveGoodsViaApi(goods.id);
    goods.status = 'available';
  }
  return goods;
}
