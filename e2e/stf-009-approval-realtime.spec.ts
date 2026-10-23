import { expect, request as playwrightRequest, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { PASSWORD, createGoodsViaApi, login, registerViaApi } from './helpers';

const TAG = Date.now().toString(36);

/** A pending-count badge: hidden at zero. */
const badgeCount = async (badge: Locator) => ((await badge.count()) ? Number(await badge.textContent()) : 0);

/** Marks the page so a later check can tell it was never reloaded. */
const markLoaded = (page: Page) => page.evaluate(() => ((window as unknown as { __stf009: boolean }).__stf009 = true));
const expectNotReloaded = async (page: Page) => expect(await page.evaluate(() => (window as unknown as { __stf009?: boolean }).__stf009)).toBe(true);

async function apiAs(baseURL: string | undefined, identifier: string) {
  const ctx = await playwrightRequest.newContext({ baseURL });
  expect((await ctx.post('/api/auth/login', { data: { identifier, password: PASSWORD } })).status()).toBe(200);
  return ctx;
}

test('stf-009: staff queues update live: new requests, decisions by another staff member, badges', async ({ browser, baseURL }) => {
  const seller = `rt_seller_${TAG}`;
  const customer: APIRequestContext = await playwrightRequest.newContext({ baseURL });
  await registerViaApi(customer, seller);
  expect((await customer.post('/api/auth/login', { data: { identifier: seller, password: PASSWORD } })).status()).toBe(200);
  const staffB = await apiAs(baseURL, 'admin');

  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await login(a, 'staff');
  const goodsBadge = a.getByTestId('badge-goods-pending');
  const creditBadge = a.getByTestId('badge-credit-pending');

  // Goods: staff A has the pending queue open; the customer adds goods.
  await a.goto('/staff/goods?status=pending');
  await expect(a.getByRole('heading', { name: 'Goods management' })).toBeVisible();
  await markLoaded(a);
  const goodsBefore = await badgeCount(goodsBadge);
  const lamp = await createGoodsViaApi(customer, { name: `Live lamp ${TAG}` }, { approve: false });
  const lampRow = a.getByTestId(`staff-goods-${lamp.id}`);
  await expect(lampRow).toContainText(`Live lamp ${TAG}`);
  await expect(lampRow.getByTestId('staff-goods-status')).toHaveText('pending approval');
  await expect.poll(() => badgeCount(goodsBadge)).toBe(goodsBefore + 1);

  // Staff B approves: A's row changes in place and the badge drops.
  expect((await staffB.post(`/api/staff/goods/${lamp.id}/approve`)).status()).toBe(200);
  await expect(lampRow.getByTestId('staff-goods-status')).toHaveText('approved');
  await expect.poll(() => badgeCount(goodsBadge)).toBe(goodsBefore);
  await expectNotReloaded(a);

  // A filter that the new request does not match: a notice instead of a row.
  await a.goto(`/staff/goods?q=${encodeURIComponent(`nothing-like-this-${TAG}`)}`);
  await markLoaded(a);
  const other = await createGoodsViaApi(customer, { name: `Notice vase ${TAG}` }, { approve: false });
  await expect(a.getByTestId('new-requests-notice')).toContainText('1 new request waiting for approval');
  await a.getByTestId('new-requests-notice').getByRole('button', { name: 'Show' }).click();
  await expect(a.getByTestId(`staff-goods-${other.id}`)).toBeVisible();

  // Detail page: staff B rejects while A has it open.
  await a.goto(`/staff/goods/${other.id}`);
  await expect(a.getByRole('button', { name: 'Approve' })).toBeEnabled();
  expect((await staffB.post(`/api/staff/goods/${other.id}/reject`, { data: { reason: 'Blurry photo' } })).status()).toBe(200);
  await expect(a.getByTestId('decided-elsewhere')).toContainText('Rejected by admin just now');
  await expect(a.getByRole('button', { name: 'Approve' })).toBeDisabled();
  await expect(a.getByRole('button', { name: 'Reject' })).toBeDisabled();

  // Credit: a top-up request appears on /staff/credit, staff B approves it.
  await a.goto('/staff/credit');
  await expect(a.getByRole('heading', { name: 'Credit management' })).toBeVisible();
  await markLoaded(a);
  const creditBefore = await badgeCount(creditBadge);
  const topup = await customer.post('/api/credit/topup', { data: { amount: 42 } });
  expect(topup.status()).toBe(201);
  const requestId = (await topup.json()).request.id as number;
  const row = a.getByTestId(`request-${requestId}`);
  await expect(row).toContainText(seller);
  await expect(row).toContainText('$42.00');
  await expect.poll(() => badgeCount(creditBadge)).toBe(creditBefore + 1);

  expect((await staffB.post(`/api/staff/credit/requests/${requestId}/approve`)).status()).toBe(200);
  await expect(row.getByTestId('decided-elsewhere')).toHaveText('Approved by admin just now');
  await expect(row.getByRole('button', { name: `Approve request ${requestId}` })).toHaveCount(0);
  await expect.poll(() => badgeCount(creditBadge)).toBe(creditBefore);
  await expectNotReloaded(a);

  // A's own decision: no 'decided elsewhere' note, the row leaves the queue.
  const second = (await (await customer.post('/api/credit/topup', { data: { amount: 7 } })).json()).request.id as number;
  await a.getByRole('button', { name: `Approve request ${second}` }).click();
  await expect(a.getByTestId(`request-${second}`)).toHaveCount(0);

  await ctxA.close();
  await customer.dispose();
  await staffB.dispose();
});
