import { expect, type APIRequestContext, type Page } from '@playwright/test';

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
export async function createAuctionViaApi(request: APIRequestContext, overrides: Record<string, unknown> = {}) {
  const categories = (await (await request.get('/api/categories')).json()).categories;
  const res = await request.post('/api/auctions', {
    data: {
      name: 'E2E Item',
      description: 'An item created by the e2e suite.',
      categoryId: categories[0].id,
      condition: 'used',
      initialPrice: 100,
      minIncrement: 10,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600_000).toISOString(),
      ...overrides,
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
  const auction = await createAuctionViaApi(request, { name, initialPrice: 100, minIncrement: 10 });
  await request.post('/api/auth/login', { data: { identifier: 'bob', password: PASSWORD } });
  expect((await request.post(`/api/auctions/${auction.id}/bids`, { data: { amount: 150 } })).status()).toBe(201);
  await request.post(`/api/dev/auctions/${auction.id}/expire`);
  await expect
    .poll(async () => (await (await request.get(`/api/dev/auctions/${auction.id}/raw`)).json()).status)
    .toBe('ended');
  await request.post('/api/auth/logout');
  return auction;
}
