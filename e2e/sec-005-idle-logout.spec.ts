import { expect, request as playwrightRequest, test, type BrowserContext, type Page } from '@playwright/test';
import { login } from './helpers';

// Dev-only override read by fe/src/idle.ts idleSettings(): short limits for this spec's pages only.
const TIMEOUT_MS = 6000;
const WARNING_MS = 3000;

async function shortIdleLimits(context: BrowserContext) {
  await context.addInitScript(
    ([timeoutMs, warningMs]) => localStorage.setItem('auction:idleSettings', JSON.stringify({ timeoutMs, warningMs })),
    [TIMEOUT_MS, WARNING_MS],
  );
}

const refreshCookie = async (context: BrowserContext) => (await context.cookies()).find((c) => c.name === 'auction_refresh')?.value;

async function expectRefreshRevoked(baseURL: string | undefined, token: string) {
  const outsider = await playwrightRequest.newContext({ baseURL });
  const replay = await outsider.post('/api/auth/refresh', { headers: { Cookie: `auction_refresh=${token}` } });
  expect(replay.status()).toBe(401);
  await outsider.dispose();
}

/** Keeps the mouse still and waits for the warning, checking the countdown counts down. */
async function waitForWarning(page: Page) {
  const warning = page.getByTestId('idle-warning');
  await expect(warning).toBeVisible({ timeout: TIMEOUT_MS });
  await expect(warning).toHaveAttribute('role', 'alertdialog');
  await expect(page.getByRole('button', { name: 'Stay signed in' })).toBeFocused();
  await expect(page.getByTestId('idle-countdown')).toHaveText(/You will be signed out in [1-3] s because of inactivity/);
  return warning;
}

test('sec-005: warning, activity keeps the session, idle logs out every tab and revokes the refresh token', async ({ page, context, baseURL }) => {
  await shortIdleLimits(context);
  await login(page, 'alice');
  await page.goto('/my-bids');
  await expect(page.getByTestId('current-user')).toHaveText('alice');

  // Mouse move dismisses the warning and the session stays.
  let warning = await waitForWarning(page);
  await page.mouse.move(50, 50);
  await page.mouse.move(250, 250, { steps: 5 });
  await expect(warning).toBeHidden();
  await expect(page.getByTestId('current-user')).toHaveText('alice');

  // 'Stay signed in' does the same (keyboard: focus is on it).
  warning = await waitForWarning(page);
  await page.keyboard.press('Enter');
  await expect(warning).toBeHidden();

  // A second tab of the same browser: it must follow the first one out.
  const second = await context.newPage();
  await second.goto('/credit');
  await expect(second.getByTestId('current-user')).toHaveText('alice');
  const token = await refreshCookie(context);
  expect(token).toBeTruthy();

  const logoutCalls: string[] = [];
  context.on('request', (req) => {
    if (new URL(req.url()).pathname === '/api/auth/logout') logoutCalls.push(req.postData() ?? '');
  });

  // No activity anywhere: warning, then the login page with the idle message, in both tabs.
  await expect(page.getByTestId('idle-warning')).toBeVisible({ timeout: TIMEOUT_MS });
  await expect(page).toHaveURL(/\/login$/, { timeout: TIMEOUT_MS });
  await expect(page.getByTestId('idle-signed-out')).toHaveText('You were signed out after 6 seconds of inactivity');
  await expect(second).toHaveURL(/\/login$/, { timeout: TIMEOUT_MS });
  await expect(second.getByTestId('idle-signed-out')).toBeVisible();
  await expect(page.getByTestId('current-user')).toHaveCount(0);

  // One logout call, with reason idle; the refresh token was revoked and the cookies cleared.
  await expect.poll(() => logoutCalls.length).toBe(1);
  expect(JSON.parse(logoutCalls[0])).toEqual({ reason: 'idle' });
  await expect.poll(() => refreshCookie(context)).toBeUndefined();
  await expectRefreshRevoked(baseURL, token!);

  // Signing in again goes back to the page the user was on.
  await page.getByLabel('Username or email').fill('alice');
  await page.getByLabel('Password', { exact: true }).fill('Password123!');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/(my-bids|credit)$/);
  await expect(page.getByTestId('current-user')).toHaveText('alice');
});

test('sec-005: staff are signed out after inactivity too; guests never see the warning', async ({ page, context, baseURL }) => {
  await shortIdleLimits(context);
  await page.goto('/');
  await page.waitForTimeout(TIMEOUT_MS + 1000);
  await expect(page.getByTestId('idle-warning')).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  await login(page, 'staff');
  const token = await refreshCookie(context);
  await waitForWarning(page);
  await expect(page).toHaveURL(/\/login$/, { timeout: TIMEOUT_MS });
  await expect(page.getByTestId('idle-signed-out')).toBeVisible();
  await expectRefreshRevoked(baseURL, token!);
});
