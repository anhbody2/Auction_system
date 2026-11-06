import { expect, request as playwrightRequest, test, type BrowserContext } from '@playwright/test';
import { login, logout, registerViaApi } from './helpers';

const TAG = Date.now().toString(36);

/**
 * The access cookie's Max-Age equals the JWT lifetime, so at expiry the browser drops it. The e2e API keeps the
 * default lifetime (Playwright API contexts used by other specs cannot refresh), so the spec drops it itself.
 * A real expired JWT being refused is covered by be/tests/auth.refresh.test.ts.
 */
const expireAccessCookie = (context: BrowserContext) => context.clearCookies({ name: 'auction_token' });

test('sec-003: the session renews itself after the access cookie expires; logout revokes the refresh token', async ({ page, context, baseURL }) => {
  const user = `rt_user_${TAG}`;
  await registerViaApi(page.request, user);
  await login(page, user);

  const cookies = await context.cookies();
  const access = cookies.find((c) => c.name === 'auction_token')!;
  const firstRefresh = cookies.find((c) => c.name === 'auction_refresh')!;
  expect(access.httpOnly).toBe(true);
  expect(firstRefresh.httpOnly).toBe(true);
  expect(firstRefresh.path).toBe('/api/auth');

  const refreshes: number[] = [];
  page.on('response', (res) => {
    if (new URL(res.url()).pathname === '/api/auth/refresh') refreshes.push(res.status());
  });

  // The access cookie expires; the next protected page renews it in the background instead of signing out.
  await expireAccessCookie(context);
  await page.locator('header nav').getByRole('link', { name: 'My goods' }).click();
  await expect(page).toHaveURL(/\/goods$/);
  await expect(page.getByRole('heading', { name: 'My goods' })).toBeVisible();
  await expect(page.getByTestId('current-user')).toContainText(user);
  // The heading can render before the page's first API call has come back through the refresh.
  await expect.poll(() => refreshes).toContain(200);

  // A full reload after expiry: the page load also renews the session.
  await expireAccessCookie(context);
  await page.reload();
  await expect(page.getByTestId('current-user')).toContainText(user);
  await expect(page).toHaveURL(/\/goods$/);

  // The refresh token was rotated: the first one is no longer the browser's.
  const current = (await context.cookies()).find((c) => c.name === 'auction_refresh')!;
  expect(current.value).not.toBe(firstRefresh.value);

  await logout(page);
  expect((await context.cookies()).some((c) => c.name === 'auction_refresh')).toBe(false);

  // Replaying the refresh token the browser held at logout is refused: it was revoked on the server.
  const outsider = await playwrightRequest.newContext({ baseURL });
  const replay = await outsider.post('/api/auth/refresh', { headers: { Cookie: `auction_refresh=${current.value}` } });
  expect(replay.status()).toBe(401);
  await outsider.dispose();

  // Signed out for real: protected pages send the user to log in.
  await page.goto('/goods');
  await expect(page).toHaveURL(/\/login$/);
});
