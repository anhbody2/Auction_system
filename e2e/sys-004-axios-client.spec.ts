import { expect, test } from '@playwright/test';
import { createAuctionViaApi, login, logout, registerViaApi, testPng } from './helpers';

const TAG = Date.now().toString(36);

test('sys-004: forms, bids and uploads go through the axios client; a 401 sends the user to log in', async ({ page, context }) => {
  // Every API call the page makes (except the SSE streams) must be an XHR: axios, not fetch.
  const apiCalls: { url: string; type: string }[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api/') && !url.pathname.endsWith('/events')) apiCalls.push({ url: url.pathname, type: req.resourceType() });
  });

  // Server validation error: the field message from the API is shown on the field.
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Taken Name');
  await page.getByLabel('Username').fill('alice');
  await page.getByLabel('Email').fill(`taken_${TAG}@example.com`);
  await page.getByLabel('Phone').fill('0900000000');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByLabel('Confirm password').fill('Password123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Username is already taken')).toBeVisible();

  // Login + image upload
  const seller = `ax_seller_${TAG}`;
  const bidder = `ax_bidder_${TAG}`;
  await registerViaApi(page.request, seller);
  await registerViaApi(page.request, bidder);
  await login(page, seller);
  await page.goto('/goods/new');
  await page.getByLabel('Name').fill(`Axios Vase ${TAG}`);
  await page.getByLabel('Description').fill('A blue glass vase, uploaded through axios.');
  await page.getByLabel('Category').selectOption({ index: 1 });
  await page.getByLabel('Condition').selectOption({ label: 'Like new' });
  await page.getByLabel('Images').setInputFiles({ name: 'vase.png', mimeType: 'image/png', buffer: await testPng() });
  await expect(page.getByRole('img', { name: 'Uploaded image 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Add goods' }).click();
  await expect(page.getByTestId('my-goods').getByRole('row', { name: new RegExp(`Axios Vase ${TAG}`) })).toBeVisible();
  const auction = await createAuctionViaApi(page.request, { name: `Axios Lamp ${TAG}`, initialPrice: 20 });
  await logout(page);

  // Place a bid
  await login(page, bidder);
  expect((await page.request.post('/api/credit/topup', { data: { amount: 100 } })).status()).toBe(201);
  await page.goto(`/auctions/${auction.id}`);
  await page.getByLabel('Your bid').fill('20');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByTestId('bid-history').getByRole('row').nth(1)).toContainText(bidder);
  // A too-low bid shows the server message.
  await page.getByLabel('Your bid').fill('20');
  await page.getByRole('button', { name: 'Place bid' }).click();
  await expect(page.getByRole('alert')).toContainText('Bid must be at least');

  for (const path of ['/api/auth/register', '/api/auth/login', '/api/uploads', '/api/goods', `/api/auctions/${auction.id}/bids`]) {
    expect(apiCalls.some((c) => c.url === path), `${path} was called`).toBe(true);
  }
  expect(apiCalls.filter((c) => c.type !== 'xhr')).toEqual([]);

  // The session goes away (cookie cleared): the next protected call signs the user out and sends them to log in.
  await context.clearCookies();
  await page.getByRole('link', { name: 'My goods' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('session-expired')).toHaveText('Your session has ended. Please log in again.');
  await expect(page.getByTestId('current-user')).toHaveCount(0);
  // Logging in again returns to the page they were on.
  await page.getByLabel('Username or email').fill(bidder);
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/goods$/);
});
