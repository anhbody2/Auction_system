import { expect, test } from '@playwright/test';
import { PASSWORD, login, logout, registerViaApi } from './helpers';

test('cust-003: customer changes password; old one stops working', async ({ page }) => {
  await registerViaApi(page.request, 'frank');
  await login(page, 'frank');
  await page.goto('/change-password');

  // Wrong current password rejected
  await page.getByLabel('Current password').fill('WrongPass1');
  await page.getByLabel('New password', { exact: true }).fill('BrandNew123');
  await page.getByLabel('Confirm new password').fill('BrandNew123');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Current password is incorrect').first()).toBeVisible();

  // Correct current password + confirmed new password
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Password changed' })).toBeVisible();

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
