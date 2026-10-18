import { expect, test } from '@playwright/test';
import { login, logout } from './helpers';

test('sec-002: admin toggles a staff permission and the staff user access changes', async ({ page }) => {
  const staffViewBox = () => page.getByLabel('report.view for staff');

  // Admin revokes report.view from staff on the permission screen
  await login(page, 'admin');
  await page.getByRole('link', { name: 'Permissions' }).click();
  await expect(page.getByRole('heading', { name: 'Role permissions' })).toBeVisible();
  await expect(staffViewBox()).toBeChecked();
  await expect(page.getByLabel('user.manage for admin')).toBeDisabled();
  await staffViewBox().click();
  await expect(page.getByRole('status').filter({ hasText: 'Revoked report.view for staff' })).toBeVisible();
  await expect(staffViewBox()).not.toBeChecked();
  await logout(page);

  // Staff now gets 'not allowed' and no Statistics link; the API answers 403
  await login(page, 'staff');
  await expect(page.getByTestId('not-allowed')).toBeVisible();
  await expect(page.locator('header nav').getByRole('link', { name: 'Statistics' })).toHaveCount(0);
  expect((await page.request.get('/api/admin/permissions')).status()).toBe(403);
  await logout(page);

  // Admin grants it back; staff can open statistics again
  await login(page, 'admin');
  await page.goto('/admin/permissions');
  await staffViewBox().click();
  await expect(page.getByRole('status').filter({ hasText: 'Granted report.view for staff' })).toBeVisible();
  await logout(page);

  await login(page, 'staff');
  await expect(page).toHaveURL(/\/staff\/statistics$/);
  await expect(page.getByRole('heading', { name: 'Auction statistics' })).toBeVisible();
});
