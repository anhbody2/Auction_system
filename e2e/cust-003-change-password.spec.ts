import { expect, test } from '@playwright/test';
import { PASSWORD, latestPasswordLink, login, logout, registerViaApi } from './helpers';

// mail-004: changing the password goes through the emailed link (the current-password form left the UI).
// The wrong-current-password rule of the deprecated PUT /api/me/password stays covered in be/tests/password.change.test.ts.
test('cust-003: customer changes password; old one stops working', async ({ page }) => {
  await registerViaApi(page.request, 'frank');
  await login(page, 'frank');
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByTestId('check-mail-screen')).toBeVisible();

  await page.goto(await latestPasswordLink(page, 'frank@example.com'));
  await page.getByLabel('New password', { exact: true }).fill('BrandNew123');
  await page.getByLabel('Confirm new password').fill('BrandNew123');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByTestId('page-notice')).toHaveText('Your password has been changed');

  // Old password fails
  await logout(page);
  await page.getByLabel('Username or email').fill('frank');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid username/email or password');

  // New password works
  await login(page, 'frank', 'BrandNew123');
  await expect(page.getByTestId('current-user')).toHaveText('frank');
});
