import { expect, test } from '@playwright/test';
import { PASSWORD, logout } from './helpers';

test('cust-001: customer logs in, logs out, and is rejected with a wrong password', async ({ page }) => {
  // 1. Open the login page
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible();

  // 2-3. Valid credentials -> redirected to dashboard and shown as logged in
  await page.getByLabel('Username or email').fill('alice');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('current-user')).toHaveText('alice');
  await expect(page.getByRole('heading', { name: /Welcome, Alice Seller/ })).toBeVisible();

  // 4. Log out, then wrong password
  await logout(page);
  await page.getByLabel('Username or email').fill('alice');
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Log in' }).click();

  // 5. Error shown, no session created
  await expect(page.getByRole('alert')).toHaveText('Invalid username/email or password');
  await expect(page.getByTestId('current-user')).toHaveCount(0);
  const me = await page.request.get('/api/auth/me');
  expect(me.status()).toBe(401);
});
